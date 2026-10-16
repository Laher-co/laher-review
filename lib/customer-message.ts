import 'server-only'
import { eq } from 'drizzle-orm'
import { db, jobs, messages, type Annotation, type MessageAttachment } from './db'
import { emitWebhook, logEvent } from './events'
import { tracked } from './issues'
import { jobPayload } from './payload'
import { openWaiting } from './waiting'
import { alertCustomerAction } from './alerts'
import { stopFollowups } from './followups'
import { siteOrigin } from './jobs'
import { versionTitle } from './format'

/**
 * Records a customer message and does everything a customer message does:
 * stops reminders, starts the response timer, alerts the queue, posts to
 * Trello and sends the v2 webhook. Used for messages on the page and for
 * replies by email. Returns null if the same message already arrived.
 */
export async function recordCustomerMessage(job: typeof jobs.$inferSelect, designerName: string | null, m: {
  version: { id: string; number: number } | null
  body: string
  annotations?: Annotation[]
  attachments?: MessageAttachment[]
  source: 'page' | 'email'
  emailFrom?: string | null
  clientKey: string | null
}) {
  const annotations = m.annotations ?? [], attachments = m.attachments ?? []
  const inserted = await db.insert(messages).values({
    jobId: job.id, versionId: m.version?.id ?? null, author: 'customer', body: m.body, annotations,
    attachments, source: m.source, emailFrom: m.emailFrom ?? null, clientKey: m.clientKey,
  }).onConflictDoNothing({ target: messages.clientKey }).returning()
  if (inserted.length === 0) return null
  await db.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, job.id))

  const where = m.version ? versionTitle(m.version.number) : 'General'
  const how = m.source === 'email' ? ' (by email)' : ''
  const blocks = [`**MESSAGE FROM CUSTOMER${how.toUpperCase()}: ${where}**`]
  if (m.body) blocks.push(m.body)
  if (annotations.length) blocks.push([`Drawing${annotations.length > 1 ? 's' : ''}:`, ...annotations.map(a => a.drawingUrl)].join('\n'))
  if (attachments.length) blocks.push([`Attachment${attachments.length > 1 ? 's' : ''}:`, ...attachments.map(a => a.url)].join('\n'))
  blocks.push(`Reply in the studio: ${siteOrigin()}/studio/jobs/${job.id}`)
  await tracked('trello_comment', job.id, `Post the customer’s message${how} (${where}) on the Trello card`,
    { type: 'trello.comment', args: { cardId: job.trelloCardId, text: blocks.join('\n\n') } })
  for (const [i, a] of [...annotations.map(x => ({ url: x.drawingUrl, kind: 'drawing' })), ...attachments.map(x => ({ url: x.url, kind: 'attachment' }))].entries()) {
    const name = `Message ${a.kind} ${i + 1} – ${where}`
    await tracked('trello_attachment', job.id, `Attach ${name} to the Trello card`,
      { type: 'trello.attach', args: { cardId: job.trelloCardId, url: a.url, name } })
  }

  await stopFollowups(job.id, ['design'], m.source === 'email' ? 'Customer replied by email' : 'Customer sent a message')
  await openWaiting(job.id, 'message')
  const extras = [
    annotations.length ? `[${annotations.length} drawing${annotations.length > 1 ? 's' : ''} attached]` : '',
    attachments.length ? `[${attachments.length} file${attachments.length > 1 ? 's' : ''} attached]` : '',
  ]
  await alertCustomerAction(job.id, `New message${how} (${where})`, [m.body, ...extras].filter(Boolean).join('\n'))
  await logEvent(job.id, null, 'customer_message', { messageId: inserted[0].id, version: m.version?.number ?? null, source: m.source })
  await emitWebhook(job.id, 'message_created', {
    ...jobPayload(job, designerName),
    message: {
      id: inserted[0].id, author: 'customer', source: m.source, emailFrom: m.emailFrom ?? null,
      thread: m.version ? 'version' : 'general',
      version: m.version ? { number: m.version.number, title: versionTitle(m.version.number) } : null,
      body: m.body,
      drawings: annotations.map(a => ({ renderUrl: a.renderUrl, drawingUrl: a.drawingUrl })),
      attachments: attachments.map(a => ({ url: a.url, name: a.name })),
    },
    actor: { type: 'customer' },
  })
  return inserted[0]
}
