import 'server-only'
import { and, eq, inArray } from 'drizzle-orm'
import { db, followups, jobs } from './db'
import { designReminder, sizeReminder } from './customer-email-templates'
import { doNotEmail, emailContext, sendCustomerEmail } from './customer-emails'
import { escapeHtml, staffEmailHtml, staffEmails } from './email'
import { logEvent } from './events'
import { tracked } from './issues'
import { siteOrigin } from './jobs'
import { reminderDueAt } from './followup-schedule'

const OPEN = ['active', 'requires_call', 'follow_up'] as const

/**
 * A version was published: the customer's quiet-spell clock starts. Any
 * earlier design follow-up for this job is closed (a new version supersedes it).
 */
export async function startDesignFollowup(jobId: string) {
  await stopFollowups(jobId, ['design'], 'New version published')
  await db.insert(followups).values({ jobId, kind: 'design' })
}

/** Approved without a ring size: start chasing the size. */
export async function startSizeFollowup(jobId: string) {
  await stopFollowups(jobId, ['size'], 'Approved again without a size')
  await db.insert(followups).values({ jobId, kind: 'size' })
}

/** Any customer action stops design follow-ups; a ring size stops size follow-ups. */
export async function stopFollowups(jobId: string, kinds: ('design' | 'size')[], reason: string) {
  await db.update(followups).set({ status: 'stopped', stoppedReason: reason, closedAt: new Date() })
    .where(and(eq(followups.jobId, jobId), inArray(followups.kind, kinds), inArray(followups.status, [...OPEN])))
}

/** Staff called or otherwise followed up: clears the flag. */
export async function closeFollowup(id: string, staffId: string, note: string) {
  const [f] = await db.update(followups)
    .set({ status: 'done', closedAt: new Date(), closedBy: staffId, closeNote: note || null })
    .where(and(eq(followups.id, id), inArray(followups.status, [...OPEN]))).returning()
  return f
}

/**
 * Runs from the cron. Reminders go at 10am Sydney on calendar days 2, 4 and 7
 * after the clock started; REQUIRES CALL is flagged at 10am on day 8 if
 * there's still no response. The automated emails run only the first time a
 * customer goes quiet on a job (and the size sequence once per job); any
 * later quiet spell, or a "Do not email" card, is flagged FOLLOW UP for
 * Jane at day 2 instead.
 */
export async function processFollowups(now = new Date()) {
  const active = await db.select({ f: followups, job: jobs })
    .from(followups).innerJoin(jobs, eq(jobs.id, followups.jobId))
    .where(eq(followups.status, 'active'))
  const log: string[] = []

  for (const { f, job } of active) {
    const next = f.remindersSent + 1 // 1, 2, 3 = reminders; 4 = requires call
    if (now < reminderDueAt(f.startedAt, next)) continue
    // Never two steps in one day (e.g. catching up after an outage)
    if (f.lastReminderAt && now.getTime() - f.lastReminderAt.getTime() < 20 * 3600_000) continue
    const size = f.kind === 'size'

    if (next === 1) {
      const firstSpell = size ? !job.sizeSequenceUsed : !job.autoSequenceUsed
      let blocked = false
      try { blocked = await doNotEmail(job.id) } catch { blocked = true } // can't check the label → don't email
      if (!firstSpell || blocked) {
        await flag(f.id, job, 'follow_up', blocked ? 'Do not email' : 'Gone quiet again', size)
        log.push(`${job.customerName}: FOLLOW UP${size ? ' – SIZE' : ''}`)
        continue
      }
      await db.update(jobs).set(size ? { sizeSequenceUsed: true } : { autoSequenceUsed: true }).where(eq(jobs.id, job.id))
      await db.update(followups).set({ automated: true }).where(eq(followups.id, f.id))
    }

    if (next <= 3) {
      const { common } = await emailContext(job.id)
      const content = size ? sizeReminder({ ...common, n: next as 1 | 2 | 3 }) : designReminder({ ...common, n: next as 1 | 2 | 3 })
      const r = await sendCustomerEmail(job.id, `${f.kind}_reminder_${next}`, content)
      if (r.ok && r.value === 'skipped') {
        // "Do not email" added during the sequence: hand over to Jane
        await flag(f.id, job, 'follow_up', 'Do not email', size)
        log.push(`${job.customerName}: FOLLOW UP (do not email)`)
        continue
      }
      await db.update(followups).set({ remindersSent: next, lastReminderAt: now }).where(eq(followups.id, f.id))
      await logEvent(job.id, null, 'followup_reminder', { kind: f.kind, n: next, ok: r.ok })
      log.push(`${job.customerName}: ${f.kind} reminder ${next}${r.ok ? '' : ' (failed, see Issues)'}`)
    } else {
      await flag(f.id, job, 'requires_call', 'No response after 3 reminders', size)
      log.push(`${job.customerName}: REQUIRES CALL${size ? ' – SIZE' : ''}`)
    }
  }
  return log
}

async function flag(id: string, job: typeof jobs.$inferSelect, status: 'requires_call' | 'follow_up', reason: string, size: boolean) {
  await db.update(followups).set({ status, flaggedAt: new Date(), stoppedReason: reason }).where(eq(followups.id, id))
  await logEvent(job.id, null, `followup_${status}`, { reason, size })
  if (status !== 'requires_call') return
  // REQUIRES CALL also alerts hello@ (and Jane)
  const label = `REQUIRES CALL${size ? ' – SIZE' : ''}`
  const link = `${siteOrigin()}/studio/jobs/${job.id}`
  await tracked('email_send', job.id, `Send ${label} alert for ${job.customerName}`, {
    type: 'email.send',
    args: {
      to: [...new Set(['hello@leiedesign.com', ...(await staffEmails(['va']))])], type: 'requires_call', jobId: job.id,
      subject: `${label}: ${job.customerName}`,
      text: `${job.customerName} hasn’t responded after three reminders${size ? ' about their ring size' : ''}. Please give them a call.\n\n${link}`,
      html: staffEmailHtml(`${label}: ${escapeHtml(job.customerName)}`,
        `<p>${escapeHtml(job.customerName)} hasn’t responded after three reminder emails${size ? ' about their ring size' : ''}. Please give them a call, then log it on the job.</p>`,
        { href: link, label: 'Open the job' }),
    },
  })
}
