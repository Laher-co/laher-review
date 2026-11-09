'use server'

import { and, eq, gt, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { put } from '@vercel/blob'
import { db, decisions, jobs, messages, onboardingNotes, onboardingQuestions, options, renders, staff, versions, type Annotation, type ChangeRequest } from '@/lib/db'
import { emitWebhook, logEvent } from '@/lib/events'
import { jobPayload } from '@/lib/payload'
import { openWaiting } from '@/lib/waiting'
import { alertCustomerAction } from '@/lib/alerts'
import { recordCustomerMessage } from '@/lib/customer-message'
import { startSizeFollowup, stopFollowups } from '@/lib/followups'
import { emailContext, sendCustomerEmail } from '@/lib/customer-emails'
import { approvedSummary, changesSummary } from '@/lib/customer-email-templates'
import { siteOrigin } from '@/lib/jobs'
import { versionTitle } from '@/lib/format'
import { areaLabel, CHANGE_AREAS, decisionHeading } from '@/lib/feedback'
import { moveOutcome, tracked } from '@/lib/issues'
import { moveToAlterationsForCustomer } from '@/lib/customer-activity'
import { checkedImages, saveMessageImage } from '@/lib/message-images'
import type { UploadedPhoto } from '@/components/PhotoAttach'
import { getCard, getList, LABEL_AWAITING_SIZE } from '@/lib/trello'
import { hasLabel, LABEL_DESIGN_APPROVED, LABEL_OLD_SYSTEM, SOURCING_LIST } from '@/lib/stone'
import { enterSourcing } from '@/lib/stone-sync'
import { approvalComment, approvalRoute, roundState } from '@/lib/approval'
import { parseDesignerList } from '@/lib/trello-parse'
import { isSettingChoice, settingPath, settingState } from '@/lib/setting'
import { recordSettingChoice } from '@/lib/setting-server'
import { answerComment, cleanClusterStyles, clusterComment, irregularClusterOn, notesComment, onboardingPath } from '@/lib/onboarding'
import type { Stroke } from '@/components/DrawingCanvas'

type Result = { ok: true } | { ok: false; error: string }

// Customers aren't signed in: the unguessable code in their link is the key.
async function jobForCode(code: string) {
  const [row] = await db.select({ job: jobs, designerName: staff.name })
    .from(jobs).leftJoin(staff, eq(staff.id, jobs.designerId))
    .where(eq(jobs.publicCode, code))
  if (!row) throw new Error('This review link isn’t valid.')
  return row
}

/** A published version of this job (any version, not just the latest). */
async function publishedVersion(jobId: string, versionId: string) {
  const [v] = await db.select().from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.jobId, jobId), eq(versions.status, 'published')))
  return v ?? null
}

const getListName = (listId: string) => getList(listId).then(l => l.name).catch(() => null)

const studioLink = (jobId: string) => `${siteOrigin()}/studio/jobs/${jobId}`

// ── Setting question ──────────────────────────────────────────────────────────

/** The customer's answer to the setting question. Changeable until Version One is published. */
export async function chooseSetting(code: string, choice: string): Promise<Result> {
  if (!isSettingChoice(choice)) return { ok: false, error: 'Please choose one of the two options.' }
  const { job } = await jobForCode(code)
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(versions)
    .where(and(eq(versions.jobId, job.id), eq(versions.status, 'published')))
  // Only for jobs with SETTING QUESTION (and not marked not needed)
  const state = settingState({ ...job, settingNotNeeded: job.settingNotNeeded || !job.settingQuestion }, n)
  if (state === 'not_needed') return { ok: false, error: 'There’s no need to choose: we have this covered for your design.' }
  if (state === 'locked' && job.settingChoice !== choice) {
    return { ok: false, error: 'Your design is already underway with this setting. Send us a message if you’d like to talk it through.' }
  }
  await recordSettingChoice(job, choice, null)
  revalidatePath(onboardingPath(code))
  return { ok: true }
}

// ── Onboarding page ───────────────────────────────────────────────────────────

const publishedCount = async (jobId: string) => (await db.select({ n: sql<number>`count(*)::int` }).from(versions)
  .where(and(eq(versions.jobId, jobId), eq(versions.status, 'published'))))[0].n
const LOCKED = 'Your design is already underway. Send us a message if you’d like to change anything.'

/** "Not sure yet": the size stays unconfirmed (the gentle size reminders carry on as usual). */
export async function markSizeNotSure(code: string): Promise<Result> {
  const { job } = await jobForCode(code)
  if (job.ringSizeStatus === 'confirmed') return { ok: true }
  await db.update(jobs).set({ ringSizeNotSureAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, job.id))
  await logEvent(job.id, null, 'ring_size_not_sure', { from: 'onboarding' })
  revalidatePath(onboardingPath(code))
  return { ok: true }
}

/** Irregular cluster styles (as many as they like). Editable until Version One is published. */
export async function saveClusterStyles(code: string, input: string[]): Promise<Result> {
  const { job } = await jobForCode(code)
  if (!irregularClusterOn(job)) return { ok: false, error: 'There’s no need to choose: we have this covered for your design.' }
  const styles = cleanClusterStyles(input)
  if (!styles.length) return { ok: false, error: 'Please choose at least one style.' }
  if (job.clusterSavedAt && await publishedCount(job.id) > 0) return { ok: false, error: LOCKED }
  const same = job.clusterStyles?.join() === styles.join()
  await db.update(jobs).set({ clusterStyles: styles, clusterSavedAt: new Date(), updatedAt: new Date() }).where(eq(jobs.id, job.id))
  if (!same) {
    await tracked('trello_comment', job.id, 'Post the irregular cluster styles on the Trello card',
      { type: 'trello.comment', args: { cardId: job.trelloCardId, text: clusterComment(styles, !!job.clusterSavedAt) } })
    await logEvent(job.id, null, 'cluster_styles_saved', { styles, from: job.clusterStyles })
  }
  revalidatePath(onboardingPath(code))
  return { ok: true }
}

/** The customer's answer to one of the team's questions. Editable until Version One is published. */
export async function answerStaffQuestion(code: string, questionId: string, raw: string): Promise<Result> {
  const { job } = await jobForCode(code)
  const answer = raw.trim().slice(0, 4000)
  if (!answer) return { ok: false, error: 'Please write your answer first.' }
  const [q] = await db.select().from(onboardingQuestions).where(and(eq(onboardingQuestions.id, questionId), eq(onboardingQuestions.jobId, job.id)))
  if (!q) return { ok: false, error: 'That question isn’t available any more. Please refresh the page.' }
  if (q.answer && await publishedCount(job.id) > 0) return { ok: false, error: LOCKED }
  if (q.answer === answer) return { ok: true }
  await db.update(onboardingQuestions).set({ answer, answeredAt: new Date() }).where(eq(onboardingQuestions.id, q.id))
  await tracked('trello_comment', job.id, 'Post the customer’s answer on the Trello card',
    { type: 'trello.comment', args: { cardId: job.trelloCardId, text: answerComment(q.question, answer, !!q.answer) } })
  await logEvent(job.id, null, 'onboarding_answer', { questionId: q.id, changed: !!q.answer })
  revalidatePath(onboardingPath(code))
  return { ok: true }
}

/** "Anything else for our designers?": notes and up to 5 inspiration photos. They can send more later. */
export async function sendDesignerNotes(code: string, input: { body: string; images?: UploadedPhoto[] }): Promise<Result> {
  const { job } = await jobForCode(code)
  const body = (input.body ?? '').trim().slice(0, 8000)
  const photos = checkedImages(job.id, input.images)
  if (!body && !photos.length) return { ok: false, error: 'Please write a note or add a photo first.' }
  await db.insert(onboardingNotes).values({ jobId: job.id, body, photos })
  // Photos stay in Studio (not attached to Trello), like message photos
  await tracked('trello_comment', job.id, 'Post the customer’s notes for the designer on the Trello card',
    { type: 'trello.comment', args: { cardId: job.trelloCardId, text: notesComment(body, photos.length) } })
  await logEvent(job.id, null, 'onboarding_notes', { photos: photos.length })
  revalidatePath(onboardingPath(code))
  return { ok: true }
}

// ── Ring size ─────────────────────────────────────────────────────────────────

export async function submitRingSize(code: string, rawSize: string): Promise<Result> {
  const { job, designerName } = await jobForCode(code)
  const size = rawSize.trim().slice(0, 40)
  if (!size) return { ok: false, error: 'Please choose or enter your ring size.' }
  if (job.ringSizeStatus === 'confirmed') return { ok: false, error: 'Your ring size has already been confirmed.' }

  // A size the customer enters is confirmed straight away (staff can still change it in Studio).
  // An approval that was waiting on the size goes ahead.
  const [updated] = await db.update(jobs).set({
    ringSize: size, ringSizeStatus: 'confirmed', ringSizeSubmittedAt: new Date(),
    ringSizeConfirmedAt: new Date(), ringSizeConfirmedBy: null, updatedAt: new Date(),
    ...(job.status === 'approved_size_needed' ? { status: 'approved' as const } : {}),
  }).where(eq(jobs.id, job.id)).returning()

  const cardId = job.trelloCardId
  await tracked('trello_fields', job.id, `Set the Finger Size fields to ${size} (Confirmed)`,
    { type: 'trello.ringFields', args: { cardId, size, status: 'Confirmed' } })
  for (const name of ['Finger Size TBC', LABEL_AWAITING_SIZE]) {
    await tracked('trello_label', job.id, `Remove the “${name}” label`, { type: 'trello.removeLabel', args: { cardId, name } })
  }
  await tracked('trello_comment', job.id, 'Post the customer’s ring size comment', {
    type: 'trello.comment', args: { cardId, text: `**FINGER SIZE CONFIRMED BY CUSTOMER: ${size}**` },
  })

  await stopFollowups(job.id, ['design', 'size'], 'Customer sent their ring size')
  await alertCustomerAction(job.id, 'Ring size confirmed by the customer', `The customer’s ring size is ${size}. Nothing to do unless it looks wrong (you can change it in the studio).`)
  await logEvent(job.id, null, 'ring_size_confirmed', { size, by: 'customer' })
  await emitWebhook(job.id, 'ring_size_confirmed', { ...jobPayload(updated, designerName), actor: { type: 'customer' } })
  revalidatePath(`/r/${code}`)
  return { ok: true }
}

// ── Drawings ──────────────────────────────────────────────────────────────────

/**
 * Saves one annotated render (render + drawing flattened to JPEG). Called once
 * per drawing before the change request is submitted, so each request stays small.
 */
export async function uploadAnnotation(code: string, form: FormData): Promise<{ drawingUrl: string; renderUrl: string } | { error: string }> {
  const { job } = await jobForCode(code)
  const renderId = String(form.get('renderId') ?? '')
  const file = form.get('file')
  if (!(file instanceof Blob) || file.type !== 'image/jpeg') return { error: 'Drawing upload failed.' }
  if (file.size > 3.5 * 1024 * 1024) return { error: 'That drawing is too large to upload.' }

  const [r] = await db.select({ render: renders, version: versions })
    .from(renders)
    .innerJoin(options, eq(options.id, renders.optionId))
    .innerJoin(versions, eq(versions.id, options.versionId))
    .where(and(eq(renders.id, renderId), eq(versions.jobId, job.id), eq(versions.status, 'published')))
  if (!r) return { error: 'That image isn’t part of your design.' }

  const blob = await put(`annotations/${job.id}/v${r.version.number}/${renderId}.jpg`, file, {
    access: 'public', addRandomSuffix: true, contentType: 'image/jpeg',
  })
  return { drawingUrl: blob.url, renderUrl: r.render.blobUrl }
}

// ── Approve / request changes ─────────────────────────────────────────────────

export type DecisionInput = {
  clientKey: string                 // one per submission, generated in the browser
  versionId: string
  decision: 'approved' | 'changes_requested'
  optionId: string | null           // required when the version has several options
  changes: ChangeRequest[]
  comments: string
  annotations: { renderId: string; drawingUrl: string; strokes: Stroke[] }[]
  // Asked for on approval when the ring size is still unconfirmed
  ringSize?: { size: string } | { notSure: true }
}

const AREA_KEYS = new Set<string>(CHANGE_AREAS.map(a => a.key))

export async function submitDecision(code: string, input: DecisionInput): Promise<Result> {
  const { job, designerName } = await jobForCode(code)
  const version = await publishedVersion(job.id, input.versionId)
  if (!version) return { ok: false, error: 'That version isn’t available. Please refresh the page.' }
  const approved = input.decision === 'approved'

  // Same submission arriving twice (double-tap, retry): already recorded
  const key = input.clientKey.slice(0, 64)
  if (key) {
    const [dupe] = await db.select({ id: decisions.id }).from(decisions).where(eq(decisions.clientKey, key))
    if (dupe) return { ok: true }
  }
  // One change request per round, and nothing more once a full design is approved
  const round = roundState(
    (await db.select({ at: versions.publishedAt }).from(versions).where(and(eq(versions.jobId, job.id), eq(versions.status, 'published')))).map(v => v.at),
    await db.select({ decision: decisions.decision, concept: decisions.concept, createdAt: decisions.createdAt }).from(decisions).where(eq(decisions.jobId, job.id)))
  const who = designerName ?? 'your designer'
  if (round === 'approved') return { ok: false, error: 'Your design is approved.' }
  if (round === 'concept_approved') return { ok: false, error: `${who} is now building your full design. You’ll be able to review it soon.` }
  if (round === 'changes_sent' && !approved) return { ok: false, error: `Your changes are with ${who}. You’ll be able to review the next version soon.` }

  // Every response is tied to one version AND one option
  const versionOptions = await db.select().from(options).where(eq(options.versionId, version.id))
  const option = versionOptions.length === 1
    ? versionOptions[0]
    : versionOptions.find(o => o.id === input.optionId) ?? null
  if (!option) return { ok: false, error: 'Please choose which option this is about.' }

  const changes = approved ? [] : input.changes
    .filter(c => AREA_KEYS.has(c.area))
    .map(c => ({ area: c.area, note: String(c.note ?? '').trim().slice(0, 2000) }))
  const comments = input.comments.trim().slice(0, 4000)

  const annotations = approved ? [] : await checkedAnnotations(job.id, version.id, input.annotations)

  if (!approved && !changes.some(c => c.note) && !comments && annotations.length === 0) {
    return { ok: false, error: 'Please tell us what you’d like changed.' }
  }

  // Ring size: an unconfirmed size must be given (or "not sure") when approving
  let submittedSize: string | null = null
  let sizeOutstanding = false
  if (approved && job.ringSizeStatus === 'unconfirmed') {
    if (input.ringSize && 'size' in input.ringSize && input.ringSize.size.trim()) {
      submittedSize = input.ringSize.size.trim().slice(0, 40)
    } else if (input.ringSize && 'notSure' in input.ringSize) {
      sizeOutstanding = true
    } else {
      return { ok: false, error: 'Please add your ring size, or choose “Not sure of my size”.' }
    }
  }

  // Where an approval goes: stone not secured → REQUIRES SOURCING; concept or
  // side stones → Alterations (held); otherwise Print Ready
  const cardId = job.trelloCardId
  const card = approved ? await getCard(cardId).catch(() => null) : null
  const oldSystem = card ? hasLabel(card.labels, LABEL_OLD_SYSTEM) : false
  const flags = { stoneNotSecured: job.stoneNotSecured, conceptRender: job.conceptRender, sideStonesUnconfirmed: job.sideStonesUnconfirmed, oldSystem }
  const route = approved ? approvalRoute(flags) : null
  const toSourcing = route?.to === 'sourcing'
  const cardDesigner = (card ? parseDesignerList((await getListName(card.idList)) ?? '')?.designer : null) ?? designerName ?? 'the designer'

  const inserted = await db.insert(decisions).values({
    jobId: job.id, versionId: version.id, optionId: option.id,
    decision: input.decision, changes, comments: comments || null, annotations,
    sizeOutstanding, clientKey: input.clientKey.slice(0, 64) || null, concept: approved && job.conceptRender,
  }).onConflictDoNothing({ target: decisions.clientKey }).returning()
  // Same submission arriving twice (double-tap, retry): already recorded
  if (inserted.length === 0) return { ok: true }

  const [updated] = await db.update(jobs).set({
    status: !approved ? 'changes_requested' : sizeOutstanding ? 'approved_size_needed' : 'approved',
    // A size the customer enters is confirmed straight away
    ...(submittedSize ? { ringSize: submittedSize, ringSizeStatus: 'confirmed' as const, ringSizeSubmittedAt: new Date(), ringSizeConfirmedAt: new Date(), ringSizeConfirmedBy: null } : {}),
    ...(approved ? { approvedHold: route!.hold } : {}),
    updatedAt: new Date(),
  }).where(eq(jobs.id, job.id)).returning()

  const heading = decisionHeading({
    decision: input.decision, sizeOutstanding, versionTitle: versionTitle(version.number),
    optionLabel: option.label, optionCount: versionOptions.length,
  })

  // Trello: bold header first, then the changes, then the drawings. The card
  // moves to the same designer's Alterations / Print Ready list (or REQUIRES SOURCING).
  // Blocks separated by one blank line: header, changes, comments, size, drawings
  const special = approved ? approvalComment(flags, `${versionTitle(version.number)}, Option ${option.label}`, cardDesigner) : []
  const blocks = special.length ? [...special] : [`**${heading}**`]
  const notes = changes.filter(c => c.note).map(c => `• **${areaLabel(c.area)}:** ${c.note}`)
  if (notes.length) blocks.push(notes.join('\n'))
  if (comments) blocks.push(`Comments: ${comments}`)
  if (submittedSize) blocks.push(`Ring size from customer: ${submittedSize} (confirmed by the customer)`)
  if (sizeOutstanding) blocks.push(`Customer isn’t sure of their ring size: ${route?.to === 'print_ready' ? 'moved to Print Ready with' : 'added'} the “${LABEL_AWAITING_SIZE}” label. Set the size in the studio to clear it.`)
  if (annotations.length) blocks.push([`Drawing${annotations.length > 1 ? 's' : ''}:`, ...annotations.map(a => a.drawingUrl)].join('\n'))
  blocks.push(`Studio: ${studioLink(job.id)}`)
  await tracked('trello_comment', job.id, `Post “${heading}” on the Trello card`,
    { type: 'trello.comment', args: { cardId, text: blocks.join('\n\n') } })
  for (const [i, a] of annotations.entries()) {
    const name = `Drawing ${i + 1} – ${heading.replace('CHANGES REQUESTED: ', '')}`
    await tracked('trello_attachment', job.id, `Attach ${name} to the Trello card`,
      { type: 'trello.attach', args: { cardId, url: a.drawingUrl, name } })
  }
  if (submittedSize) {
    await tracked('trello_fields', job.id, `Set the Finger Size fields to ${submittedSize} (Confirmed)`,
      { type: 'trello.ringFields', args: { cardId, size: submittedSize, status: 'Confirmed' } })
    await tracked('trello_label', job.id, 'Remove the “Finger Size TBC” label',
      { type: 'trello.removeLabel', args: { cardId, name: 'Finger Size TBC' } })
  }
  if (approved && !oldSystem) {
    await tracked('trello_label', job.id, `Add the “${LABEL_DESIGN_APPROVED}” label`,
      { type: 'trello.addLabel', args: { cardId, name: LABEL_DESIGN_APPROVED, createColor: 'green' } })
  }
  const trello = !approved
    ? await moveToAlterationsForCustomer(job, heading)
    : toSourcing
      ? moveOutcome(await tracked('trello_move', job.id, `Move the card to ${SOURCING_LIST} (${heading}, stone not secured)`,
          { type: 'trello.toList', args: { cardId, list: SOURCING_LIST } }))
      : route?.to === 'alterations'
        ? moveOutcome(await tracked('trello_move', job.id, `Move the card to Alterations (${heading}, ${route.hold === 'concept' ? 'concept render' : 'side stones to confirm'})`,
            { type: 'trello.move', args: { cardId, stage: 'Alterations' } }))
        : moveOutcome(await tracked('trello_move', job.id, `Move the card to Print Ready (${heading})`,
            { type: 'trello.move', args: { cardId, stage: 'Print Ready' } }))
  if (toSourcing && trello.moved) await enterSourcing(job.id, 'approved', cardDesigner, 'app')
  if (sizeOutstanding) {
    await tracked('trello_label', job.id, `Add the “${LABEL_AWAITING_SIZE}” label`,
      { type: 'trello.addLabel', args: { cardId, name: LABEL_AWAITING_SIZE, createColor: 'orange' } })
  }

  await stopFollowups(job.id, ['design'], approved ? 'Customer approved' : 'Customer requested changes')
  if (sizeOutstanding) await startSizeFollowup(job.id)

  // Summary email: what they asked for and what happens next
  const { common } = await emailContext(job.id)
  const what = `${versionTitle(version.number)}${versionOptions.length > 1 ? `, Option ${option.label}` : ''}`
  await sendCustomerEmail(job.id, approved ? 'approved_summary' : 'changes_summary', approved
    ? approvedSummary({ ...common, what, comments: comments || null, sizeOutstanding, next: route?.hold === 'concept' ? 'full_design' : route?.hold === 'side_stones' ? 'finalising' : 'production' })
    : changesSummary({
        ...common, what, comments: comments || null, drawings: annotations.length,
        changes: changes.filter(c => c.note).map(c => `${areaLabel(c.area)}: ${c.note}`),
      }))

  await openWaiting(job.id, 'decision')
  await alertCustomerAction(job.id, heading, [
    ...changes.filter(c => c.note).map(c => `${areaLabel(c.area)}: ${c.note}`),
    comments ? `Comments: ${comments}` : '',
    submittedSize ? `Ring size given: ${submittedSize} (confirmed by the customer)` : '',
    sizeOutstanding ? 'Not sure of their ring size: please help them confirm it.' : '',
    route?.hold === 'concept' ? 'Concept approved: card moved to Alterations to build the full render.' : '',
    route?.hold === 'side_stones' ? 'Side stone sizes to confirm: card moved to Alterations. Move it to Print Ready once confirmed.' : '',
    annotations.length ? `${annotations.length} drawing${annotations.length > 1 ? 's' : ''} attached` : '',
  ].filter(Boolean).join('\n'))
  await logEvent(job.id, null, approved ? 'design_approved' : 'changes_requested', {
    version: version.number, option: option.label, decisionId: inserted[0].id, sizeOutstanding, trello,
  })
  await emitWebhook(job.id, 'decision_submitted', {
    ...jobPayload(updated, designerName),
    decision: {
      type: input.decision,
      heading,
      version: { number: version.number, title: versionTitle(version.number) },
      option: { label: option.label },
      optionCount: versionOptions.length,
      changes: changes.map(c => ({ ...c, label: areaLabel(c.area) })),
      comments: comments || null,
      sizeOutstanding,
      // Strokes stay in the database; Zapier gets the images
      drawings: annotations.map(a => ({ renderUrl: a.renderUrl, drawingUrl: a.drawingUrl })),
    },
    trello,
    actor: { type: 'customer' },
  })

  // No revalidatePath here: any revalidation refreshes the customer's page
  // immediately, which would unmount the thank-you screen before it's seen.
  // The page refreshes when they close it; staff pages are always dynamic.
  return { ok: true }
}

type AnnotationInput = { renderId: string; drawingUrl: string; strokes: Stroke[] }

/** Keeps only drawings on this version's renders that were uploaded under this job. */
async function checkedAnnotations(jobId: string, versionId: string, input: AnnotationInput[]): Promise<Annotation[]> {
  const versionRenders = await db.select({ id: renders.id, url: renders.blobUrl }).from(renders)
    .innerJoin(options, eq(options.id, renders.optionId))
    .where(eq(options.versionId, versionId))
  const out: Annotation[] = []
  for (const a of input.slice(0, 12)) {
    const render = versionRenders.find(r => r.id === a.renderId)
    let url: URL
    try { url = new URL(a.drawingUrl) } catch { continue }
    if (!render || !url.hostname.endsWith('.public.blob.vercel-storage.com') || !url.pathname.startsWith(`/annotations/${jobId}/`)) continue
    out.push({ renderId: render.id, renderUrl: render.url, drawingUrl: a.drawingUrl, strokes: limitStrokes(a.strokes) })
  }
  return out
}

/** Caps stored stroke data (~5,000 points per drawing) and drops malformed input. */
function limitStrokes(strokes: unknown): Stroke[] {
  if (!Array.isArray(strokes)) return []
  let budget = 5000
  const out: Stroke[] = []
  for (const s of strokes.slice(0, 200)) {
    if (!s || typeof s !== 'object' || !Array.isArray((s as Stroke).points)) continue
    const pts = (s as Stroke).points
      .filter(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && n >= 0 && n <= 1))
      .slice(0, budget) as [number, number][]
    budget -= pts.length
    out.push({ color: String((s as Stroke).color).slice(0, 9), width: Number((s as Stroke).width) || 0.005, points: pts })
    if (budget <= 0) break
  }
  return out
}

// ── Messages ──────────────────────────────────────────────────────────────────

export type MessageInput = {
  clientKey: string
  versionId: string | null        // null = the general "message the studio" thread
  body: string
  annotations: AnnotationInput[]  // only on a version's thread
  images?: UploadedPhoto[]        // from uploadMessageImage, up to 5
}

/** One photo for a message (shrunk in the browser first). Called once per photo before sending. */
export async function uploadMessageImage(code: string, form: FormData): Promise<UploadedPhoto | { error: string }> {
  const { job } = await jobForCode(code)
  return saveMessageImage(job.id, form.get('file'))
}

/**
 * A customer message, on a version's thread or the general one. Available at
 * every stage (after changes or approval too). Starts the response timer,
 * posts to Trello and sends a v2 webhook.
 */
export async function sendCustomerMessage(code: string, input: MessageInput): Promise<Result> {
  const { job, designerName } = await jobForCode(code)
  const body = input.body.trim().slice(0, 4000)

  const version = input.versionId ? await publishedVersion(job.id, input.versionId) : null
  if (input.versionId && !version) return { ok: false, error: 'That version isn’t available. Please refresh the page.' }
  const annotations = version ? await checkedAnnotations(job.id, version.id, input.annotations) : []
  const images = checkedImages(job.id, input.images)
  if (!body && annotations.length === 0 && images.length === 0) return { ok: false, error: 'Please write a message or add a photo.' }

  // Simple guard against a runaway script: plenty for a real customer
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(messages)
    .where(and(eq(messages.jobId, job.id), eq(messages.author, 'customer'), gt(messages.createdAt, sql`now() - interval '1 hour'`)))
  if (n >= 30) return { ok: false, error: 'You’ve sent a lot of messages in the last hour. Please try again a little later.' }

  await recordCustomerMessage(job, designerName, {
    version: version ? { id: version.id, number: version.number } : null,
    body, annotations, attachments: images, source: 'page', clientKey: input.clientKey.slice(0, 64) || null,
  })
  // Messages never move the Trello card: they go to Jane's queue as normal
  revalidatePath(`/r/${code}`)
  return { ok: true }
}
