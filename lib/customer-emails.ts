import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { db, emails, jobs, staff } from './db'
import { sendEmail } from './email'
import { logEvent } from './events'
import { tracked } from './issues'
import { reviewUrl } from './jobs'
import { cardHasLabel, getCard, LABEL_DO_NOT_EMAIL } from './trello'
import type { EmailContent } from './customer-email-templates'
import { newReplyToken, replyAddress } from './email-reply'

export const CUSTOMER_REPLY_TO = 'hello@leiedesign.com'

/** Replies come back into the app once receiving on reply.laher.co is verified (INBOUND_EMAIL=1). */
export const repliesComeBack = () => process.env.INBOUND_EMAIL === '1'

/** The job's own reply address, creating its token the first time it's needed. */
export async function jobReplyAddress(jobId: string) {
  const [job] = await db.select({ token: jobs.replyToken }).from(jobs).where(eq(jobs.id, jobId))
  if (job?.token) return replyAddress(job.token)
  const token = newReplyToken()
  await db.update(jobs).set({ replyToken: token }).where(and(eq(jobs.id, jobId), isNull(jobs.replyToken)))
  const [again] = await db.select({ token: jobs.replyToken }).from(jobs).where(eq(jobs.id, jobId))
  return replyAddress(again.token!)
}

/** The details every customer email needs. */
export async function emailContext(jobId: string) {
  const [row] = await db.select({ job: jobs, designer: staff.name })
    .from(jobs).leftJoin(staff, eq(staff.id, jobs.designerId)).where(eq(jobs.id, jobId))
  if (!row) throw new Error('Job not found')
  return {
    job: row.job,
    common: {
      firstName: row.job.customerName.split(' ')[0] || row.job.customerName,
      designer: row.designer ?? 'Your designer',
      pageUrl: reviewUrl(row.job),
      ringSizeNeeded: row.job.ringSizeStatus === 'unconfirmed',
      ringSizeHint: row.job.ringSizeStatus === 'unconfirmed' ? row.job.ringSize : null,
      replyByEmail: repliesComeBack(),
    },
  }
}

/** Is the card labelled "Do not email"? Read live; throws if Trello can't be reached. */
export async function doNotEmail(jobId: string) {
  const [job] = await db.select({ cardId: jobs.trelloCardId }).from(jobs).where(eq(jobs.id, jobId))
  const card = await getCard(job.cardId)
  if (!card) throw new Error('Trello card not found (can’t check the “Do not email” label)')
  return cardHasLabel(card, LABEL_DO_NOT_EMAIL)
}

/**
 * The only way customer emails are sent. Checks "Do not email" live at send
 * time (so adding the label stops emails straight away); if Trello can't be
 * reached the email isn't sent and becomes an issue whose Retry checks again.
 */
export async function sendCustomerEmail(jobId: string, type: string, content: EmailContent) {
  return tracked<'sent' | 'skipped'>('email_send', jobId, `Email the customer: “${content.subject}”`,
    { type: 'customer.send', args: { jobId, type, ...content } })
}

/** Used by sendCustomerEmail and by Retry in the Issues panel. */
export async function deliverCustomerEmail(a: { jobId: string; type: string } & EmailContent): Promise<'sent' | 'skipped'> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, a.jobId))
  if (!job) throw new Error('Job not found')
  // Blocked by the Trello label or the Studio toggle (whichever is on: if a
  // label change didn't reach the app, we'd rather not email than email)
  const labelled = await doNotEmail(a.jobId)
  if (labelled && !job.doNotEmail) await db.update(jobs).set({ doNotEmail: true }).where(eq(jobs.id, job.id))
  const blocked = labelled || job.doNotEmail
  if (blocked) {
    await db.insert(emails).values({ jobId: a.jobId, to: job.customerEmail, type: a.type, status: 'skipped_do_not_email' })
    await logEvent(a.jobId, null, 'customer_email_skipped', { type: a.type, reason: 'Do not email' })
    return 'skipped'
  }
  await sendEmail({
    to: job.customerEmail, type: a.type, jobId: a.jobId,
    replyTo: repliesComeBack() ? await jobReplyAddress(a.jobId) : CUSTOMER_REPLY_TO,
    subject: a.subject, html: a.html, text: a.text,
  })
  await logEvent(a.jobId, null, 'customer_emailed', { type: a.type, subject: a.subject })
  return 'sent'
}
