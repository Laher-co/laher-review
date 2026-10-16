import 'server-only'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db, followups, jobs, versions } from './db'
import { designReminder, laterVersionReminder, sizeReminder } from './customer-email-templates'
import { versionTitle } from './format'
import { doNotEmail, emailContext, sendCustomerEmail } from './customer-emails'
import { escapeHtml, staffEmailHtml, staffEmails } from './email'
import { logEvent } from './events'
import { tracked } from './issues'
import { siteOrigin } from './jobs'
import { reminderDueAt } from './followup-schedule'

const OPEN = ['active', 'requires_call', 'follow_up'] as const

/**
 * A version was published: the customer's quiet-spell clock starts. Version
 * One gets the full gentle sequence; later versions get one reminder. Any
 * earlier design follow-up for this job is closed (a new version supersedes it).
 */
export async function startDesignFollowup(jobId: string, versionNumber: number) {
  await stopFollowups(jobId, ['design'], 'New version published')
  await db.insert(followups).values({ jobId, kind: 'design', plan: versionNumber === 1 ? 'first' : 'later' })
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
 * Runs from the cron (10am Sydney, calendar days):
 * - Version One: gentle reminders on day 2, 4 and 7, then REQUIRES CALL on day 8.
 * - Version Two onwards: one gentle reminder on day 2; FOLLOW UP for Jane on day 4.
 * - Ring size: reminders on day 2, 4 and 7, then REQUIRES CALL – SIZE (once per job).
 * - "Do not email": no emails; FOLLOW UP for Jane on day 2.
 * Any customer action stops design follow-ups; only a size stops size ones.
 */
export async function processFollowups(now = new Date()) {
  const active = await db.select({ f: followups, job: jobs })
    .from(followups).innerJoin(jobs, eq(jobs.id, followups.jobId))
    .where(eq(followups.status, 'active'))
  const log: string[] = []

  for (const { f, job } of active) {
    const size = f.kind === 'size'
    const plan = size ? 'first' : (f.plan === 'later' ? 'later' : 'first')
    const next = f.remindersSent + 1
    if (now < reminderDueAt(f.startedAt, next, plan)) continue
    // Never two steps in one day (e.g. catching up after an outage)
    if (f.lastReminderAt && now.getTime() - f.lastReminderAt.getTime() < 20 * 3600_000) continue
    const remindersInPlan = plan === 'later' ? 1 : 3

    if (next === 1) {
      let blocked = false
      try { blocked = job.doNotEmail || await doNotEmail(job.id) } catch { blocked = true } // can’t check the label → don’t email
      const secondSizeSpell = size && job.sizeSequenceUsed
      if (blocked || secondSizeSpell) {
        await flag(f.id, job, 'follow_up', blocked ? 'Do not email' : 'Ring size still needed', size)
        log.push(`${job.customerName}: FOLLOW UP${size ? ' – SIZE' : ''}`)
        continue
      }
      if (size) await db.update(jobs).set({ sizeSequenceUsed: true }).where(eq(jobs.id, job.id))
      await db.update(followups).set({ automated: true }).where(eq(followups.id, f.id))
    }

    if (next <= remindersInPlan) {
      const { common } = await emailContext(job.id)
      const content = size ? sizeReminder({ ...common, n: next as 1 | 2 | 3 })
        : plan === 'later' ? laterVersionReminder({ ...common, versionTitle: await latestVersionTitle(job.id) })
        : designReminder({ ...common, n: next as 1 | 2 | 3 })
      const r = await sendCustomerEmail(job.id, `${f.kind}_${plan}_reminder_${next}`, content)
      if (r.ok && r.value === 'skipped') {
        // "Do not email" added during the sequence: hand over to Jane
        await flag(f.id, job, 'follow_up', 'Do not email', size)
        log.push(`${job.customerName}: FOLLOW UP (do not email)`)
        continue
      }
      await db.update(followups).set({ remindersSent: next, lastReminderAt: now }).where(eq(followups.id, f.id))
      await logEvent(job.id, null, 'followup_reminder', { kind: f.kind, plan, n: next, ok: r.ok })
      log.push(`${job.customerName}: ${f.kind} ${plan === 'later' ? 'later-version ' : ''}reminder ${next}${r.ok ? '' : ' (failed, see Issues)'}`)
    } else if (plan === 'later') {
      await flag(f.id, job, 'follow_up', 'No response 2 days after the reminder', size)
      log.push(`${job.customerName}: FOLLOW UP`)
    } else {
      await flag(f.id, job, 'requires_call', 'No response after 3 reminders', size)
      log.push(`${job.customerName}: REQUIRES CALL${size ? ' – SIZE' : ''}`)
    }
  }
  return log
}

async function latestVersionTitle(jobId: string) {
  const [v] = await db.select({ n: versions.number }).from(versions)
    .where(and(eq(versions.jobId, jobId), eq(versions.status, 'published'))).orderBy(desc(versions.number)).limit(1)
  return versionTitle(v?.n ?? 2)
}

async function flag(id: string, job: typeof jobs.$inferSelect, status: 'requires_call' | 'follow_up', reason: string, size: boolean) {
  await db.update(followups).set({ status, flaggedAt: new Date(), stoppedReason: reason }).where(eq(followups.id, id))
  await logEvent(job.id, null, `followup_${status}`, { reason, size })
  // Alert Jane (and hello@) for both REQUIRES CALL and FOLLOW UP
  const label = `${status === 'requires_call' ? 'REQUIRES CALL' : 'FOLLOW UP'}${size ? ' – SIZE' : ''}`
  const link = `${siteOrigin()}/studio/jobs/${job.id}`
  const why = status === 'requires_call'
    ? `${job.customerName} hasn’t responded after three gentle reminders${size ? ' about their ring size' : ''}. Please give them a call, then log it on the job.`
    : reason === 'Do not email'
      ? `${job.customerName}’s card is marked “Do not email”, so no reminders were sent${size ? ' about their ring size' : ''}. Please follow up personally, then log it on the job.`
      : `${job.customerName} hasn’t responded${size ? ' about their ring size' : ' since the reminder about their latest version'}. Please follow up personally, then log it on the job.`
  await tracked('email_send', job.id, `Send ${label} alert for ${job.customerName}`, {
    type: 'email.send',
    args: {
      to: [...new Set(['hello@leiedesign.com', ...(await staffEmails(['va']))])], type: status, jobId: job.id,
      subject: `${label}: ${job.customerName}`,
      text: `${why}\n\n${link}`,
      html: staffEmailHtml(`${label}: ${escapeHtml(job.customerName)}`, `<p>${escapeHtml(why)}</p>`, { href: link, label: 'Open the job' }),
    },
  })
}
