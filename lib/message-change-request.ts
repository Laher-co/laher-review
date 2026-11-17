import 'server-only'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, decisions, jobs, messages, options, staff, versions, type Annotation, type MessageAttachment } from './db'
import { emitWebhook, logEvent } from './events'
import { jobPayload } from './payload'
import { openWaiting } from './waiting'
import { alertCustomerAction } from './alerts'
import { stopFollowups } from './followups'
import { emailContext, sendCustomerEmail } from './customer-emails'
import { changesSummary } from './customer-email-templates'
import { siteOrigin } from './jobs'
import { versionTitle } from './format'
import { decisionHeading } from './feedback'
import { moveOutcome, tracked } from './issues'
import { moveToAlterationsForCustomer } from './customer-activity'
import { getCard, getList } from './trello'
import { hasLabel, LABEL_OLD_SYSTEM } from './stone'
import { parseDesignerList } from './trello-parse'
import { roundState } from './approval'
import { photoNote } from './customer-message'
import { joinableChangeRequest, liveDecisions, type CardStage } from './message-routing'

type Job = typeof jobs.$inferSelect
const studioLink = (jobId: string) => `${siteOrigin()}/studio/jobs/${jobId}`

/** The card's list right now, or null if Trello can't be reached (then nothing is asked or moved). */
export async function cardNow(cardId: string): Promise<{ listName: string; stage: CardStage | null; oldSystem: boolean } | null> {
  try {
    const card = await getCard(cardId)
    if (!card) return null
    const list = await getList(card.idList)
    return { listName: list.name, stage: (parseDesignerList(list.name)?.stage ?? null) as CardStage | null, oldSystem: hasLabel(card.labels, LABEL_OLD_SYSTEM) }
  } catch {
    return null
  }
}

/** Published versions (newest first), every decision, this round, and the change request a message can join. */
export async function roundFor(jobId: string, now = new Date()) {
  const published = await db.select({ id: versions.id, number: versions.number, publishedAt: versions.publishedAt })
    .from(versions).where(and(eq(versions.jobId, jobId), eq(versions.status, 'published'))).orderBy(desc(versions.number))
  const all = await db.select().from(decisions).where(eq(decisions.jobId, jobId))
  const live = liveDecisions(all)
  const round = roundState(published.map(v => v.publishedAt), live)
  const joinable = joinableChangeRequest(published.map(v => v.publishedAt), all, now)
  const joinableVersion = joinable ? published.find(v => v.id === joinable.versionId) ?? null : null
  return { published, latest: published[0] ?? null, all, round, joinable: joinable && joinableVersion ? { id: joinable.id, versionNumber: joinableVersion.number } : null }
}

/**
 * A customer message becomes a change request on the current version: the
 * usual CHANGES REQUESTED comment (with the message text), card to
 * Alterations, design reminders stopped, the changes summary email, the queue
 * alert and the webhook. `by` is set when staff used "Treat as change request"
 * (then no email: the customer chose "just a question").
 */
export async function changeRequestFromMessage(job: Job, designerName: string | null, messageId: string,
  by: { staffId: string; name: string } | null) {
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId))
  if (!m || m.jobId !== job.id || m.author !== 'customer') throw new Error('Message not found')
  if (m.changeRequestId) return { ok: false as const, error: 'That message is already part of a change request.' }

  const { latest } = await roundFor(job.id)
  const version = m.versionId
    ? (await db.select().from(versions).where(eq(versions.id, m.versionId)))[0]
    : latest ? (await db.select().from(versions).where(eq(versions.id, latest.id)))[0] : null
  if (!version) return { ok: false as const, error: 'There’s no published version to change.' }
  const versionOptions = await db.select().from(options).where(eq(options.versionId, version.id))
  const option = versionOptions.length === 1 ? versionOptions[0] : null

  const [d] = await db.insert(decisions).values({
    jobId: job.id, versionId: version.id, optionId: option?.id ?? null, decision: 'changes_requested',
    changes: [], comments: m.body || null, annotations: m.annotations, clientKey: `msg:${m.id}`,
    fromMessageId: m.id, markedBy: by?.staffId ?? null,
  }).onConflictDoNothing({ target: decisions.clientKey }).returning()
  if (!d) return { ok: true as const, duplicate: true }
  await db.update(messages).set({ changeRequestId: d.id, ...(by ? {} : { intent: 'change' as const }) }).where(eq(messages.id, m.id))
  const [updated] = await db.update(jobs).set({ status: 'changes_requested', updatedAt: new Date() }).where(eq(jobs.id, job.id)).returning()

  const heading = decisionHeading({ decision: 'changes_requested', versionTitle: versionTitle(version.number), optionLabel: option?.label, optionCount: versionOptions.length })
  const photos = (m.attachments as MessageAttachment[]).filter(a => a.contentType.startsWith('image/'))
  const files = (m.attachments as MessageAttachment[]).filter(a => !a.contentType.startsWith('image/'))
  const annotations = m.annotations as Annotation[]
  const blocks = [`**${heading}**`]
  blocks.push(by
    ? `From the customer’s message (${by.name} marked it as a change request):`
    : 'From the customer’s message (they confirmed it’s a change to the design):')
  if (m.body) blocks.push(m.body)
  if (photos.length) blocks.push(photoNote(photos.length))
  if (files.length) blocks.push([`Attachment${files.length > 1 ? 's' : ''}:`, ...files.map(a => a.url)].join('\n'))
  if (annotations.length) blocks.push([`Drawing${annotations.length > 1 ? 's' : ''}:`, ...annotations.map(a => a.drawingUrl)].join('\n'))
  blocks.push(`Studio: ${studioLink(job.id)}`)
  await tracked('trello_comment', job.id, `Post “${heading}” (from a message) on the Trello card`,
    { type: 'trello.comment', args: { cardId: job.trelloCardId, text: blocks.join('\n\n') } })
  for (const [i, a] of annotations.entries()) {
    const name = `Drawing ${i + 1} – ${heading.replace('CHANGES REQUESTED: ', '')}`
    await tracked('trello_attachment', job.id, `Attach ${name} to the Trello card`,
      { type: 'trello.attach', args: { cardId: job.trelloCardId, url: a.drawingUrl, name } })
  }

  const trello = await moveToAlterationsForCustomer(job, heading)
  await stopFollowups(job.id, ['design'], 'Customer requested changes')
  if (!by) {
    const { common } = await emailContext(job.id)
    await sendCustomerEmail(job.id, 'changes_summary', changesSummary({
      ...common, what: `${versionTitle(version.number)}${option && versionOptions.length > 1 ? `, Option ${option.label}` : ''}`,
      comments: m.body || null, drawings: annotations.length, changes: [],
    }))
  }
  await openWaiting(job.id, 'decision')
  await alertCustomerAction(job.id, by ? `${heading} (marked by ${by.name})` : `${heading} (from a message)`,
    [m.body, annotations.length ? `${annotations.length} drawing${annotations.length > 1 ? 's' : ''} attached` : ''].filter(Boolean).join('\n'),
    m.attachments as MessageAttachment[])
  await logEvent(job.id, by?.staffId ?? null, 'changes_requested', {
    version: version.number, option: option?.label ?? null, decisionId: d.id, sizeOutstanding: false, trello,
    fromMessage: m.id, by: by ? 'staff' : 'customer',
  })
  await emitWebhook(job.id, 'decision_submitted', {
    ...jobPayload(updated, designerName),
    decision: {
      type: 'changes_requested', heading,
      version: { number: version.number, title: versionTitle(version.number) },
      option: option ? { label: option.label } : null, optionCount: versionOptions.length,
      changes: [], comments: m.body || null, sizeOutstanding: false,
      drawings: annotations.map(a => ({ renderUrl: a.renderUrl, drawingUrl: a.drawingUrl })),
      fromMessage: true,
    },
    trello,
    actor: by ? { type: 'staff', name: by.name } : { type: 'customer' },
  })
  return { ok: true as const, decisionId: d.id, heading, trello }
}

/** Staff "Treat as change request" on a message that's within 24 hours of an existing request: added to it. */
export async function addMessageToRequest(job: Job, messageId: string, request: { id: string; versionNumber: number }, by: { staffId: string; name: string }) {
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId))
  if (!m || m.jobId !== job.id) throw new Error('Message not found')
  await db.update(messages).set({ changeRequestId: request.id }).where(eq(messages.id, m.id))
  await tracked('trello_comment', job.id, `Post the customer’s message (added to the change request by ${by.name}) on the Trello card`, {
    type: 'trello.comment',
    args: { cardId: job.trelloCardId, text: [`**ADDED TO CHANGE REQUEST: ${versionTitle(request.versionNumber)}**`, `${by.name} added this customer message to the change request:`, m.body, `Studio: ${studioLink(job.id)}`].filter(Boolean).join('\n\n') },
  })
  await logEvent(job.id, by.staffId, 'message_added_to_change_request', { messageId: m.id, decisionId: request.id })
}

/**
 * "Move back to Revision (just a question)": the change request made from a
 * message no longer counts. The card goes back to Revision, the messages stay
 * as ordinary messages, and the customer's page shows the version as open again.
 */
export async function undoMessageChangeRequest(job: Job, decisionId: string, by: { staffId: string; name: string }) {
  const [d] = await db.update(decisions).set({ voidedAt: new Date(), voidedBy: by.staffId })
    .where(and(eq(decisions.id, decisionId), eq(decisions.jobId, job.id))).returning()
  if (!d) throw new Error('Change request not found')
  const linked = await db.select({ id: messages.id }).from(messages).where(eq(messages.changeRequestId, d.id))
  if (linked.length) {
    await db.update(messages).set({ changeRequestId: null }).where(inArray(messages.id, linked.map(x => x.id)))
  }
  if (d.fromMessageId) await db.update(messages).set({ intent: 'question' }).where(eq(messages.id, d.fromMessageId))
  await db.update(jobs).set({ status: 'in_review', updatedAt: new Date() }).where(eq(jobs.id, job.id))

  const t = moveOutcome(await tracked('trello_move', job.id, `Move the card back to Revision (${by.name}: just a question)`,
    { type: 'trello.move', args: { cardId: job.trelloCardId, stage: 'Revision' } }))
  const [v] = await db.select({ number: versions.number }).from(versions).where(eq(versions.id, d.versionId))
  await tracked('trello_comment', job.id, 'Post “Moved back to Revision” on the Trello card', {
    type: 'trello.comment',
    args: { cardId: job.trelloCardId, text: `**MOVED BACK TO REVISION: ${versionTitle(v?.number ?? 1)}**\n\n${by.name} marked the customer’s message as just a question, not a change. Nothing to change in the design.\n\nStudio: ${studioLink(job.id)}` },
  })
  await logEvent(job.id, by.staffId, 'change_request_undone', { decisionId: d.id, messages: linked.length, trello: t })
  return t
}

export const staffName = async (staffId: string) =>
  (await db.select({ name: staff.name }).from(staff).where(eq(staff.id, staffId)))[0]?.name ?? 'Studio'
