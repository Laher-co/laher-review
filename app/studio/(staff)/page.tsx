import Link from 'next/link'
import { asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { db, escalations, followups, issues, jobs, staff, versions, waiting } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { Badge } from '@/components/brand'
import { formatSydney, versionTitle } from '@/lib/format'
import { addWorkingMinutes, formatMinutes, workingMinutesBetween } from '@/lib/working-hours'
import { OVERDUE_WORKING_MINUTES } from '@/lib/alerts'
import { weeklyKpis } from '@/lib/kpi'
import { followupLabel } from '@/lib/followup-schedule'

export const metadata = { title: 'Studio — LAHER' }

type View = 'queue' | 'followups' | 'mine' | 'escalations' | 'all'
const DEFAULT_VIEW = { va: 'queue', owner: 'queue', escalations: 'escalations', designer: 'mine', admin: 'queue' } as const

const STATUS: Record<string, { label: string; tone: 'neutral' | 'cocoa' | 'warn' | 'ok' }> = {
  draft:                { label: 'Not sent yet',           tone: 'neutral' },
  in_review:            { label: 'With customer',          tone: 'cocoa' },
  changes_requested:    { label: 'Changes requested',      tone: 'warn' },
  approved:             { label: 'Approved',               tone: 'ok' },
  approved_size_needed: { label: 'Approved – size needed', tone: 'warn' },
  closed:               { label: 'Closed',                 tone: 'neutral' },
}
const WAITING_FOR = { message: 'Message', decision: 'Feedback', ring_size: 'Ring size' } as const

export default async function StudioHome({ searchParams }: { searchParams: { view?: View } }) {
  const session = await requireStaff()
  const [me] = await db.select().from(staff).where(eq(staff.id, session.staffId))
  const view: View = searchParams.view ?? DEFAULT_VIEW[me?.role ?? 'va']
  const now = new Date()

  const [queue, openEscalations, kpis, [{ openIssues }], openFollowups] = await Promise.all([
    db.select({ w: waiting, job: jobs, designer: staff.name })
      .from(waiting).innerJoin(jobs, eq(jobs.id, waiting.jobId)).leftJoin(staff, eq(staff.id, jobs.designerId))
      .where(isNull(waiting.answeredAt)).orderBy(asc(waiting.waitingSince)),
    db.select({ e: escalations, job: jobs, by: staff.name })
      .from(escalations).innerJoin(jobs, eq(jobs.id, escalations.jobId)).leftJoin(staff, eq(staff.id, escalations.raisedBy))
      .where(isNull(escalations.resolvedAt)).orderBy(asc(escalations.raisedAt)),
    weeklyKpis(now),
    db.select({ openIssues: sql<number>`count(*)::int` }).from(issues).where(eq(issues.status, 'open')),
    db.select({ f: followups, job: jobs, designer: staff.name })
      .from(followups).innerJoin(jobs, eq(jobs.id, followups.jobId)).leftJoin(staff, eq(staff.id, jobs.designerId))
      .where(inArray(followups.status, ['active', 'requires_call', 'follow_up'])).orderBy(asc(followups.startedAt)),
  ])
  const flagged = openFollowups.filter(x => x.f.status !== 'active')
  const followupByJob = new Map(openFollowups.map(x => [x.job.id, x.f]))
  const waitingJobIds = new Set(queue.map(q => q.job.id))
  const escalatedJobIds = new Set(openEscalations.map(e => e.job.id))

  const jobRows = view === 'mine' || view === 'all'
    ? await db.select({
        job: jobs, designer: staff.name,
        latest: sql<number | null>`(select max(${versions.number}) from ${versions} where ${versions.jobId} = ${jobs.id} and ${versions.status} = 'published')`,
      })
        .from(jobs).leftJoin(staff, eq(staff.id, jobs.designerId))
        .where(view === 'mine' ? eq(jobs.designerId, session.staffId) : undefined)
        .orderBy(desc(jobs.updatedAt))
    : []

  const tabs: { id: View; label: string; count?: number }[] = [
    { id: 'queue', label: 'Queue', count: queue.length },
    { id: 'followups', label: 'Follow-ups', count: flagged.length },
    { id: 'mine', label: 'My jobs' },
    { id: 'escalations', label: 'Escalations', count: openEscalations.length },
    { id: 'all', label: 'All jobs' },
  ]

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-3xl text-cocoa-dark">Hello, {session.name}</h1>
        {me?.role === 'owner' && openIssues > 0 && (
          <Link href="/studio/issues" className="text-sm font-medium text-red-700 underline">{openIssues} open issue{openIssues === 1 ? '' : 's'}</Link>
        )}
      </div>

      <Kpis kpis={kpis} />

      <nav className="mb-5 mt-6 flex flex-wrap gap-1 rounded-xl border border-sand bg-white p-1 text-sm">
        {tabs.map(t => (
          <Link key={t.id} href={`/studio?view=${t.id}`}
            className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 ${view === t.id ? 'bg-cocoa text-ivory' : 'text-cocoa-light hover:bg-linen'}`}>
            {t.label}
            {!!t.count && <span className={`rounded-full px-1.5 text-[11px] font-semibold ${view === t.id ? 'bg-ivory/20' : 'bg-amber-100 text-amber-900'}`}>{t.count}</span>}
          </Link>
        ))}
      </nav>

      {view === 'queue' && (
        queue.length === 0 ? <Empty title="Nobody is waiting" body="Customer messages, feedback and ring sizes appear here until someone responds." /> : (
          <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand bg-white/70">
            {queue.map(({ w, job, designer }) => {
              const overdue = addWorkingMinutes(w.waitingSince, OVERDUE_WORKING_MINUTES) <= now
              return (
                <li key={w.id}>
                  <Link href={`/studio/jobs/${job.id}`} className="flex flex-col gap-1.5 px-4 py-4 hover:bg-linen/60 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{job.customerName}</p>
                      <p className="text-sm text-stone">{WAITING_FOR[w.reason]} · {designer ?? 'No designer'}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      {escalatedJobIds.has(job.id) && <Badge tone="danger">Escalated</Badge>}
                      {overdue && <Badge tone="danger">Overdue</Badge>}
                      <span className={overdue ? 'font-semibold text-red-700' : 'text-cocoa'}>
                        waiting {formatMinutes(workingMinutesBetween(w.waitingSince, now))}
                      </span>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )
      )}

      {view === 'followups' && (
        openFollowups.length === 0 ? <Empty title="No follow-ups" body="Customers who go quiet after a new version (or an approval without a ring size) appear here." /> : (
          <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand bg-white/70">
            {[...flagged.filter(x => x.f.status === 'requires_call'), ...flagged.filter(x => x.f.status === 'follow_up'), ...openFollowups.filter(x => x.f.status === 'active')]
              .map(({ f, job, designer }) => (
                <li key={f.id}>
                  <Link href={`/studio/jobs/${job.id}`} className="flex flex-col gap-1.5 px-4 py-4 hover:bg-linen/60 sm:flex-row sm:items-center sm:gap-5 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{job.customerName}</p>
                      <p className="text-sm text-stone">{designer ?? 'No designer'} · since {formatSydney(f.startedAt)}</p>
                    </div>
                    <Badge tone={f.status === 'active' ? 'neutral' : 'danger'}>{followupLabel(f)}</Badge>
                  </Link>
                </li>
              ))}
          </ul>
        )
      )}

      {view === 'escalations' && (
        openEscalations.length === 0 ? <Empty title="No open escalations" body="Jobs escalated to Rach appear here." /> : (
          <ul className="space-y-3">
            {openEscalations.map(({ e, job, by }) => (
              <li key={e.id}>
                <Link href={`/studio/jobs/${job.id}`} className="block rounded-2xl border border-red-200 bg-white/80 p-4 hover:bg-linen/60">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{job.customerName}</span>
                    <span className="ml-auto text-xs text-stone">by {by}, {formatSydney(e.raisedAt)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-sm text-ink">{e.note}</p>
                </Link>
              </li>
            ))}
          </ul>
        )
      )}

      {(view === 'mine' || view === 'all') && (
        jobRows.length === 0
          ? <Empty title={view === 'mine' ? 'No jobs assigned to you yet' : 'No jobs yet'} body="Jobs are created from a card’s “Open in LAHER Studio” link, or with New job." />
          : (
            <ul className="divide-y divide-sand overflow-hidden rounded-2xl border border-sand bg-white/70">
              {jobRows.map(({ job, designer, latest }) => {
                const status = STATUS[job.status]
                return (
                  <li key={job.id}>
                    <Link href={`/studio/jobs/${job.id}`}
                      className="flex flex-col gap-2 px-4 py-4 hover:bg-linen/60 sm:flex-row sm:items-center sm:gap-6 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink">{job.customerName}</p>
                        <p className="truncate text-sm text-stone">{job.customerEmail}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-cocoa-light sm:justify-end">
                        {view === 'all' && <span>{designer ?? 'No designer'}</span>}
                        <span>{latest ? versionTitle(latest) : 'No version sent'}</span>
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {waitingJobIds.has(job.id) && <Badge tone="warn">Awaiting reply</Badge>}
                        {escalatedJobIds.has(job.id) && <Badge tone="danger">Escalated</Badge>}
                        {followupByJob.get(job.id) && (
                          <Badge tone={followupByJob.get(job.id)!.status === 'active' ? 'neutral' : 'danger'}>{followupLabel(followupByJob.get(job.id)!)}</Badge>
                        )}
                        {job.ringSizeStatus !== 'confirmed' && <Badge tone="neutral">Size {job.ringSizeStatus}</Badge>}
                      </div>
                      <span className="text-xs text-stone sm:w-24 sm:text-right">{formatSydney(job.updatedAt)}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )
      )}
    </div>
  )
}

function Kpis({ kpis }: { kpis: Awaited<ReturnType<typeof weeklyKpis>> }) {
  const cell = (label: string, s: typeof kpis.thisWeek) => (
    <div className="rounded-xl border border-sand bg-white/70 px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.18em] text-cocoa-light">{label}</p>
      <p className="mt-1 text-sm text-ink">
        Average response <strong className="text-lg">{s.averageMinutes === null ? '—' : formatMinutes(s.averageMinutes)}</strong>
      </p>
      <p className="text-sm text-stone">{s.answered} answered · <span className={s.overdue ? 'font-medium text-red-700' : ''}>{s.overdue} overdue</span></p>
    </div>
  )
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cell('This week', kpis.thisWeek)}
      {cell('Last week', kpis.lastWeek)}
    </div>
  )
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-sand bg-white/50 px-6 py-14 text-center">
      <p className="font-serif text-xl text-cocoa-dark">{title}</p>
      <p className="mt-2 text-sm text-stone">{body}</p>
    </div>
  )
}
