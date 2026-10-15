import Link from 'next/link'
import { desc, eq, inArray } from 'drizzle-orm'
import { db, issues, jobs, staff } from '@/lib/db'
import { formatSydney } from '@/lib/format'
import { Badge } from '@/components/brand'
import { IssueActions } from './client'

export const metadata = { title: 'Issues — LAHER Studio' }

const KIND_LABEL: Record<string, string> = {
  trello_move: 'Trello move', trello_comment: 'Trello comment', trello_attachment: 'Trello attachment',
  trello_label: 'Trello label', trello_fields: 'Trello fields', email_send: 'Email', email_bounce: 'Email bounced',
  webhook: 'Zapier webhook',
}

export default async function IssuesPage({ searchParams }: { searchParams: { show?: string } }) {
  const showClosed = searchParams.show === 'closed'
  const rows = await db.select({ issue: issues, customerName: jobs.customerName, resolvedBy: staff.name })
    .from(issues)
    .leftJoin(jobs, eq(jobs.id, issues.jobId))
    .leftJoin(staff, eq(staff.id, issues.resolvedBy))
    .where(showClosed ? inArray(issues.status, ['resolved', 'ignored']) : eq(issues.status, 'open'))
    .orderBy(desc(issues.createdAt))
    .limit(200)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-cocoa-dark">Issues</h1>
          <p className="mt-1 text-sm text-stone">Anything that didn’t go through: Trello, emails and Zapier. Retry once the cause is fixed.</p>
        </div>
        <nav className="flex rounded-lg border border-sand bg-white p-1 text-sm">
          <Link href="/studio/issues" className={`rounded-md px-3 py-1.5 ${!showClosed ? 'bg-cocoa text-ivory' : 'text-cocoa-light'}`}>Open</Link>
          <Link href="/studio/issues?show=closed" className={`rounded-md px-3 py-1.5 ${showClosed ? 'bg-cocoa text-ivory' : 'text-cocoa-light'}`}>Resolved</Link>
        </nav>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-white/50 px-6 py-14 text-center">
          <p className="font-serif text-xl text-cocoa-dark">{showClosed ? 'Nothing resolved yet' : 'All clear'}</p>
          <p className="mt-2 text-sm text-stone">{showClosed ? '' : 'Nothing has failed. Failures appear here and are emailed straight away.'}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ issue: i, customerName, resolvedBy }) => (
            <li key={i.id} className="rounded-2xl border border-sand bg-white/80 p-4 sm:p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={i.status === 'open' ? 'danger' : 'neutral'}>{KIND_LABEL[i.kind] ?? i.kind}</Badge>
                {i.jobId && customerName && (
                  <Link href={`/studio/jobs/${i.jobId}`} className="text-sm font-medium text-cocoa underline">{customerName}</Link>
                )}
                <span className="ml-auto text-xs text-stone">{formatSydney(i.createdAt)}</span>
              </div>
              <p className="mt-2 text-[15px] text-ink">{i.summary}</p>
              <p className="mt-1 break-words text-sm text-red-800/80">{i.lastError}</p>
              <p className="mt-2 text-xs text-stone">
                {i.attempts} attempt{i.attempts === 1 ? '' : 's'} · last {formatSydney(i.lastAttemptAt)}
                {i.alertedAt ? ' · alert emailed' : ' · alert email not sent'}
                {i.status !== 'open' && ` · ${i.status} by ${resolvedBy ?? '—'}${i.resolvedAt ? `, ${formatSydney(i.resolvedAt)}` : ''}`}
              </p>
              <IssueActions id={i.id} status={i.status} canRetry={!!i.operation} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
