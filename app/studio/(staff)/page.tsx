import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { db, jobs, staff, versions } from '@/lib/db'
import { Badge } from '@/components/brand'
import { formatSydney, versionTitle } from '@/lib/format'

export const metadata = { title: 'Jobs — LAHER Studio' }

const STATUS: Record<string, { label: string; tone: 'neutral' | 'cocoa' | 'warn' | 'ok' }> = {
  draft:             { label: 'Not sent yet',      tone: 'neutral' },
  in_review:         { label: 'With customer',     tone: 'cocoa' },
  changes_requested: { label: 'Changes requested', tone: 'warn' },
  approved:          { label: 'Approved',          tone: 'ok' },
  approved_size_needed: { label: 'Approved – size needed', tone: 'warn' },
  closed:            { label: 'Closed',            tone: 'neutral' },
}

// The unanswered-first queue arrives with messaging in Phase 3
export default async function JobsPage() {
  const rows = await db.select({
    job: jobs,
    designer: staff.name,
    latest: sql<number | null>`(select max(${versions.number}) from ${versions} where ${versions.jobId} = ${jobs.id} and ${versions.status} = 'published')`,
  })
    .from(jobs).leftJoin(staff, eq(staff.id, jobs.designerId))
    .orderBy(desc(jobs.updatedAt))

  return (
    <div>
      <div className="mb-6 flex items-end justify-between gap-4">
        <h1 className="font-serif text-3xl text-cocoa-dark">Jobs</h1>
        <p className="text-sm text-stone">{rows.length} {rows.length === 1 ? 'job' : 'jobs'}</p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-sand bg-white/50 px-6 py-16 text-center">
          <p className="font-serif text-xl text-cocoa-dark">No jobs yet</p>
          <p className="mt-2 text-sm text-stone">Start one from a Trello card to upload renders.</p>
          <Link href="/studio/new" className="mt-6 inline-block rounded-lg bg-cocoa px-5 py-3 text-sm text-ivory hover:bg-cocoa-dark">
            New job
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand bg-white/70">
          {rows.map(({ job, designer, latest }) => {
            const status = STATUS[job.status]
            return (
              <li key={job.id}>
                <Link href={`/studio/jobs/${job.id}`}
                  className="flex flex-col gap-2 px-4 py-4 transition-colors hover:bg-linen/60 sm:flex-row sm:items-center sm:gap-6 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{job.customerName}</p>
                    <p className="truncate text-sm text-stone">{job.customerEmail}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-cocoa-light sm:w-[26rem] sm:justify-end">
                    <span>{designer ?? 'No designer'}</span>
                    <span className="text-sand">·</span>
                    <span>{latest ? versionTitle(latest) : 'No version sent'}</span>
                    <Badge tone={status.tone}>{status.label}</Badge>
                    {job.ringSizeStatus !== 'confirmed' && <Badge tone="warn">Size {job.ringSizeStatus}</Badge>}
                  </div>
                  <span className="text-xs text-stone sm:w-24 sm:text-right">{formatSydney(job.updatedAt)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
