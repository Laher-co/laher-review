import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { db, jobs, staff, waiting, type MessageAttachment } from './db'
import { escapeHtml, staffEmailHtml, staffEmails } from './email'
import { tracked } from './issues'
import { siteOrigin } from './jobs'
import { addWorkingMinutes, formatMinutes, workingMinutesBetween } from './working-hours'

export const OVERDUE_WORKING_MINUTES = 240 // 4 working hours

const queueRecipients = () => staffEmails(['va', 'owner']) // Jane and hello@ (deduplicated)

/**
 * Emails the queue (Jane + hello@) about any customer action: message,
 * change request, approval or ring size. A failed send becomes an issue.
 */
/** Photos as tappable thumbnails (other files as links), so staff can see them without opening Studio. */
function filesHtml(files: MessageAttachment[]) {
  if (!files.length) return ''
  return `<p style="margin:0 0 14px">${files.map(f => f.contentType.startsWith('image/')
    ? `<a href="${escapeHtml(f.url)}" style="display:inline-block;margin:0 6px 6px 0"><img src="${escapeHtml(f.url)}" alt="${escapeHtml(f.name)}" width="140" style="width:140px;height:auto;border-radius:8px;border:1px solid #E4D9CB"></a>`
    : `<a href="${escapeHtml(f.url)}" style="color:#4A3022">📎 ${escapeHtml(f.name)}</a><br>`).join('')}</p>`
}

export async function alertCustomerAction(jobId: string, what: string, preview: string, files: MessageAttachment[] = []) {
  const [row] = await db.select({ job: jobs, designer: staff.name })
    .from(jobs).leftJoin(staff, eq(staff.id, jobs.designerId)).where(eq(jobs.id, jobId))
  if (!row) return
  const { job, designer } = row
  const link = `${siteOrigin()}/studio/jobs/${job.id}`
  const subject = `${what}: ${job.customerName}${designer ? ` (${designer})` : ''}`
  const short = preview.length > 400 ? `${preview.slice(0, 400)}…` : preview
  await tracked('email_send', job.id, `Alert the queue: ${subject}`, {
    type: 'email.send',
    args: {
      to: await queueRecipients(), type: 'queue_alert', jobId: job.id, subject,
      text: `${subject}\n\n${short}${files.length ? `\n\n${files.map(f => f.url).join('\n')}` : ''}\n\nReply in the studio: ${link}`,
      html: staffEmailHtml(escapeHtml(subject),
        `${short ? `<p style="white-space:pre-line;background:#F1EAE0;border-radius:8px;padding:12px 14px">${escapeHtml(short)}</p>` : ''}
         ${filesHtml(files)}
         <p style="color:#8C7B6E">Please respond within 4 working hours.</p>`,
        { href: link, label: 'Open in LAHER Studio' }),
    },
  })
  await db.update(waiting).set({ alertSentAt: new Date() })
    .where(and(eq(waiting.jobId, jobId), isNull(waiting.answeredAt), isNull(waiting.alertSentAt)))
}

/** Every open queue item past 4 working hours gets one OVERDUE alert. */
export async function sendOverdueAlerts(now = new Date()) {
  const open = await db.select({ w: waiting, job: jobs, designer: staff.name })
    .from(waiting).innerJoin(jobs, eq(jobs.id, waiting.jobId)).leftJoin(staff, eq(staff.id, jobs.designerId))
    .where(and(isNull(waiting.answeredAt), isNull(waiting.overdueAlertSentAt)))
  let sent = 0
  for (const { w, job, designer } of open) {
    if (addWorkingMinutes(w.waitingSince, OVERDUE_WORKING_MINUTES) > now) continue
    const waited = formatMinutes(workingMinutesBetween(w.waitingSince, now))
    const link = `${siteOrigin()}/studio/jobs/${job.id}`
    const subject = `OVERDUE: ${job.customerName}${designer ? ` (${designer})` : ''}, waiting ${waited}`
    await tracked('email_send', job.id, `Send OVERDUE alert for ${job.customerName}`, {
      type: 'email.send',
      args: {
        to: await queueRecipients(), type: 'overdue_alert', jobId: job.id, subject,
        text: `${subject} (working hours)\n\nReply in the studio: ${link}`,
        html: staffEmailHtml(`OVERDUE: ${escapeHtml(job.customerName)}`,
          `<p>This customer has been waiting <strong>${waited}</strong> (working hours) for a reply.</p>`,
          { href: link, label: 'Reply now' }),
      },
    })
    await db.update(waiting).set({ overdueAlertSentAt: now }).where(eq(waiting.id, w.id))
    sent++
  }
  return sent
}
