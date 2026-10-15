import 'server-only'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db, jobs, options, renders, staff, versions } from './db'

export type JobRow     = typeof jobs.$inferSelect
export type VersionRow = typeof versions.$inferSelect
export type OptionRow  = typeof options.$inferSelect
export type RenderRow  = typeof renders.$inferSelect

export type FullOption  = OptionRow & { renders: RenderRow[] }
export type FullVersion = VersionRow & { options: FullOption[] }

/** 22-character url-safe random code for the customer link. */
export function newPublicCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Buffer.from(bytes).toString('base64url')
}

/** The public origin of this deployment (works for localhost, previews and production). */
export function siteOrigin() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const h = headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export const reviewUrl = (job: Pick<JobRow, 'publicCode'>) => `${siteOrigin()}/r/${job.publicCode}`

/** Versions newest first, each with options (A, B…) and their renders in order. */
export async function loadVersions(jobId: string, opts: { publishedOnly?: boolean } = {}): Promise<FullVersion[]> {
  const vs = await db.select().from(versions)
    .where(opts.publishedOnly
      ? and(eq(versions.jobId, jobId), eq(versions.status, 'published'))
      : eq(versions.jobId, jobId))
    .orderBy(desc(versions.number))
  if (vs.length === 0) return []

  const os = await db.select().from(options)
    .where(inArray(options.versionId, vs.map(v => v.id)))
    .orderBy(asc(options.sort), asc(options.label))
  const rs = os.length === 0 ? [] : await db.select().from(renders)
    .where(inArray(renders.optionId, os.map(o => o.id)))
    .orderBy(asc(renders.sort), asc(renders.createdAt))

  return vs.map(v => ({
    ...v,
    options: os.filter(o => o.versionId === v.id)
      .map(o => ({ ...o, renders: rs.filter(r => r.optionId === o.id) })),
  }))
}

export async function getJob(id: string) {
  const [row] = await db.select({ job: jobs, designerName: staff.name })
    .from(jobs).leftJoin(staff, eq(staff.id, jobs.designerId))
    .where(eq(jobs.id, id))
  return row ?? null
}

export async function getJobByCode(code: string) {
  const [row] = await db.select({ job: jobs, designerName: staff.name })
    .from(jobs).leftJoin(staff, eq(staff.id, jobs.designerId))
    .where(eq(jobs.publicCode, code))
  return row ?? null
}

/** Looks up the version/option/job chain behind an option, for permission checks. */
export async function getOptionContext(optionId: string) {
  const [row] = await db.select({ option: options, version: versions, job: jobs })
    .from(options)
    .innerJoin(versions, eq(versions.id, options.versionId))
    .innerJoin(jobs, eq(jobs.id, versions.jobId))
    .where(eq(options.id, optionId))
  return row ?? null
}
