import { NextResponse } from 'next/server'
import { desc, eq } from 'drizzle-orm'
import { db, issues, jobs, kv } from '@/lib/db'
import { escapeHtml, sendEmail, staffEmailHtml, staffEmails } from '@/lib/email'
import { recordIssue } from '@/lib/issues'
import { sendOverdueAlerts } from '@/lib/alerts'
import { processFollowups } from '@/lib/followups'
import { siteOrigin } from '@/lib/jobs'
import { formatSydney } from '@/lib/format'
import { sydneyDate, sydneyHour } from '@/lib/sydney'

export const dynamic = 'force-dynamic'

// Vercel Cron calls this every 15 minutes (cron schedules are UTC, so Sydney
// times are checked here; that keeps 9am right through daylight saving changes).
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  const results: Record<string, unknown> = {}
  results.overdueAlerts = await sendOverdueAlerts()
  results.followups = await processFollowups()
  results.issuesDigest = await issuesDigest().catch(digestFailed)
  return NextResponse.json({ ok: true, ...results })
}

/** 9am Sydney: one email listing every issue that's still open (nothing if all clear). */
async function issuesDigest() {
  const today = sydneyDate()
  if (sydneyHour() < 9) return 'not yet 9am'
  const [last] = await db.select().from(kv).where(eq(kv.key, 'issues_digest_sent'))
  if (last?.value === today) return 'already sent today'

  const open = await db.select({ issue: issues, customerName: jobs.customerName })
    .from(issues).leftJoin(jobs, eq(jobs.id, issues.jobId))
    .where(eq(issues.status, 'open')).orderBy(desc(issues.createdAt))

  if (open.length > 0) {
    const items = open.map(({ issue: i, customerName }) =>
      `<li style="margin-bottom:10px"><strong>${escapeHtml(i.summary)}</strong>${customerName ? ` (${escapeHtml(customerName)})` : ''}<br>
       <span style="color:#8C7B6E">${escapeHtml(i.lastError ?? '')} · since ${formatSydney(i.createdAt)}</span></li>`).join('')
    await sendEmail({
      to: await staffEmails(['owner']), type: 'issue_digest',
      subject: `Review app: ${open.length} unresolved issue${open.length === 1 ? '' : 's'}`,
      text: open.map(({ issue: i, customerName }) => `• ${i.summary}${customerName ? ` (${customerName})` : ''} — ${i.lastError}`).join('\n')
        + `\n\nOpen the Issues panel: ${siteOrigin()}/studio/issues`,
      html: staffEmailHtml(`${open.length} issue${open.length === 1 ? '' : 's'} still unresolved`,
        `<ul style="padding-left:18px">${items}</ul>`, { href: `${siteOrigin()}/studio/issues`, label: 'Open Issues' }),
    })
  }
  // Mark the day done only after a successful send, so a failure retries next hour
  await db.insert(kv).values({ key: 'issues_digest_sent', value: today })
    .onConflictDoUpdate({ target: kv.key, set: { value: today, updatedAt: new Date() } })
  return open.length ? `sent (${open.length})` : 'nothing open'
}

/** The digest couldn't be sent: record it once per day so it shows in the panel. */
async function digestFailed(err: unknown) {
  const error = err instanceof Error ? err.message : String(err)
  const today = sydneyDate()
  const [flag] = await db.select().from(kv).where(eq(kv.key, 'issues_digest_failed'))
  if (flag?.value !== today) {
    await db.insert(kv).values({ key: 'issues_digest_failed', value: today })
      .onConflictDoUpdate({ target: kv.key, set: { value: today, updatedAt: new Date() } })
    await recordIssue({ kind: 'email_send', jobId: null, summary: 'Send the 9am issues digest', operation: null, error })
  }
  return `failed: ${error}`
}
