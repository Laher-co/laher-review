'use server'

import { and, asc, eq, max, ne, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { del } from '@vercel/blob'
import { db, jobs, options, renders, staff, versions } from '@/lib/db'
import { checkStaffPassword, requireStaff } from '@/lib/auth'
import { SESSION_COOKIE, SESSION_DAYS, signSession } from '@/lib/session'
import { emitWebhook, logEvent } from '@/lib/events'
import { getOptionContext, loadVersions, newPublicCode, reviewUrl } from '@/lib/jobs'
import { optionLabel, versionTitle } from '@/lib/format'
import {
  cardFunnel, cardHasLabel, ensureLabel, getCard, LABEL_DO_NOT_EMAIL, LABEL_REVIEW_APP,
  moveCardToStage, readRingSizeFields, writeRingSizeFields, type MoveResult,
} from '@/lib/trello'
import { extractEmail, descriptionSection, parseRingSize } from '@/lib/trello-parse'

// ── Sign in / out ─────────────────────────────────────────────────────────────

export async function signIn(_: unknown, form: FormData): Promise<{ error?: string }> {
  const password = String(form.get('password') ?? '')
  const staffId  = String(form.get('staffId') ?? '')
  const next     = String(form.get('next') ?? '/studio')

  if (!checkStaffPassword(password)) return { error: 'That password isn’t right.' }
  const [person] = await db.select().from(staff).where(and(eq(staff.id, staffId), eq(staff.active, true)))
  if (!person) return { error: 'Please choose your name.' }

  cookies().set(SESSION_COOKIE, await signSession(person.id, person.name), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: SESSION_DAYS * 86_400,
  })
  await logEvent(null, person.id, 'staff_signed_in')
  redirect(next.startsWith('/studio') ? next : '/studio')
}

export async function signOut() {
  cookies().delete(SESSION_COOKIE)
  redirect('/studio/login')
}

// ── Jobs ──────────────────────────────────────────────────────────────────────

export type CardPreview = {
  cardId: string
  cardUrl: string
  cardName: string
  listName: string
  customerName: string
  customerEmail: string
  designer: string | null
  designerId: string | null
  ringSize: string | null
  ringSizeStatus: 'unconfirmed' | 'confirmed'
  ringSizeNote: string | null
  doNotEmail: boolean
  existingJobId: string | null
}

/** Reads a Trello card so staff can check the details before creating a job. */
export async function previewCard(ref: string): Promise<{ preview?: CardPreview; error?: string }> {
  await requireStaff()
  const card = await getCard(ref)
  if (!card) return { error: 'Couldn’t find that Trello card. Paste the card’s link from Trello.' }

  const [{ list, funnel }, fields, [existing]] = await Promise.all([
    cardFunnel(card),
    readRingSizeFields(card),
    db.select({ id: jobs.id }).from(jobs).where(eq(jobs.trelloCardId, card.id)),
  ])

  // Ring size: the app's custom fields win; otherwise read the description
  const fromDesc = parseRingSize(card.desc)
  const ringSize = fields.size ?? fromDesc.size
  const ringSizeStatus = fields.statusText?.toLowerCase() === 'confirmed' || (!fields.statusText && ringSize && fromDesc.status === 'confirmed')
    ? 'confirmed' : 'unconfirmed'

  const designers = await db.select().from(staff).where(eq(staff.active, true))
  const designer = funnel?.designer ?? null
  const designerRow = designer ? designers.find(d => d.name.toLowerCase() === designer.toLowerCase()) : undefined

  return {
    preview: {
      cardId:         card.id,
      cardUrl:        card.shortUrl,
      cardName:       card.name,
      listName:       list.name,
      customerName:   descriptionSection(card.desc, 'Name') ?? '',
      customerEmail:  extractEmail(card.name, descriptionSection(card.desc, 'Contact Details'), card.desc) ?? '',
      designer,
      designerId:     designerRow?.id ?? null,
      ringSize,
      ringSizeStatus,
      ringSizeNote:   fromDesc.note,
      doNotEmail:     cardHasLabel(card, LABEL_DO_NOT_EMAIL),
      existingJobId:  existing?.id ?? null,
    },
  }
}

export async function createJob(_: unknown, form: FormData): Promise<{ error?: string }> {
  const session = await requireStaff()
  const cardRef       = String(form.get('cardRef') ?? '')
  const customerName  = String(form.get('customerName') ?? '').trim()
  const customerEmail = String(form.get('customerEmail') ?? '').trim().toLowerCase()
  const designerId    = String(form.get('designerId') ?? '') || null

  if (!customerName)  return { error: 'Add the customer’s name.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return { error: 'Add a valid customer email.' }

  const { preview, error } = await previewCard(cardRef)
  if (!preview) return { error }
  if (preview.existingJobId) redirect(`/studio/jobs/${preview.existingJobId}`)

  const [job] = await db.insert(jobs).values({
    publicCode:     newPublicCode(),
    trelloCardId:   preview.cardId,
    trelloShortUrl: preview.cardUrl,
    title:          preview.cardName,
    customerName,
    customerEmail,
    designerId,
    ringSize:       preview.ringSize,
    ringSizeStatus: preview.ringSizeStatus,
    createdBy:      session.staffId,
  }).returning()

  // Start Version One with Option A, ready for uploads
  const [v] = await db.insert(versions).values({ jobId: job.id, number: 1 }).returning()
  await db.insert(options).values({ versionId: v.id, label: 'A', sort: 0 })

  // Mirror the ring size to the card's custom fields so Trello shows it too
  const card = await getCard(preview.cardId)
  if (card) {
    await writeRingSizeFields(card, preview.ringSize, preview.ringSizeStatus === 'confirmed' ? 'Confirmed' : 'Unconfirmed')
      .catch(err => console.error('[createJob] ring size fields:', err))
  }

  await logEvent(job.id, session.staffId, 'job_created', { trelloCardId: preview.cardId })
  redirect(`/studio/jobs/${job.id}`)
}

// ── Versions & options ────────────────────────────────────────────────────────

async function draftVersionOrThrow(versionId: string) {
  const [v] = await db.select().from(versions).where(eq(versions.id, versionId))
  if (!v) throw new Error('Version not found.')
  if (v.status !== 'draft') throw new Error('This version is already published and can’t be changed.')
  return v
}

export async function createVersion(jobId: string) {
  const session = await requireStaff()
  const [draft] = await db.select({ id: versions.id }).from(versions)
    .where(and(eq(versions.jobId, jobId), eq(versions.status, 'draft')))
  if (!draft) {
    const [{ n }] = await db.select({ n: max(versions.number) }).from(versions).where(eq(versions.jobId, jobId))
    const [v] = await db.insert(versions).values({ jobId, number: (n ?? 0) + 1 }).returning()
    await db.insert(options).values({ versionId: v.id, label: 'A', sort: 0 })
    await logEvent(jobId, session.staffId, 'version_created', { number: v.number })
  }
  revalidatePath(`/studio/jobs/${jobId}`)
}

export async function deleteDraftVersion(versionId: string) {
  const session = await requireStaff()
  const v = await draftVersionOrThrow(versionId)
  const rs = await db.select({ path: renders.blobPath }).from(renders)
    .innerJoin(options, eq(options.id, renders.optionId))
    .where(eq(options.versionId, versionId))
  await db.delete(versions).where(eq(versions.id, versionId))
  if (rs.length) await del(rs.map(r => r.path)).catch(err => console.error('[deleteDraftVersion] blob delete:', err))
  await logEvent(v.jobId, session.staffId, 'version_deleted', { number: v.number })
  revalidatePath(`/studio/jobs/${v.jobId}`)
}

export async function saveVersionNote(versionId: string, note: string) {
  await requireStaff()
  const v = await draftVersionOrThrow(versionId)
  await db.update(versions).set({ designerNote: note.trim() || null }).where(eq(versions.id, versionId))
  revalidatePath(`/studio/jobs/${v.jobId}`)
}

export async function addOption(versionId: string) {
  await requireStaff()
  const v = await draftVersionOrThrow(versionId)
  const existing = await db.select().from(options).where(eq(options.versionId, versionId)).orderBy(asc(options.sort))
  if (existing.length >= 6) throw new Error('Up to six options per version.')
  await db.insert(options).values({ versionId, label: optionLabel(existing.length), sort: existing.length })
  revalidatePath(`/studio/jobs/${v.jobId}`)
}

export async function removeOption(optionId: string) {
  await requireStaff()
  const ctx = await getOptionContext(optionId)
  if (!ctx) return
  await draftVersionOrThrow(ctx.version.id)
  const siblings = await db.select().from(options).where(eq(options.versionId, ctx.version.id)).orderBy(asc(options.sort))
  if (siblings.length <= 1) throw new Error('A version needs at least one option.')

  const rs = await db.select({ path: renders.blobPath }).from(renders).where(eq(renders.optionId, optionId))
  await db.delete(options).where(eq(options.id, optionId))
  if (rs.length) await del(rs.map(r => r.path)).catch(err => console.error('[removeOption] blob delete:', err))

  // Re-letter the remaining options so they stay A, B, C… without gaps.
  // Two passes avoid clashing with the unique (version, label) index.
  const rest = siblings.filter(o => o.id !== optionId)
  for (const o of rest) await db.update(options).set({ label: `_${o.id}` }).where(eq(options.id, o.id))
  for (const [i, o] of rest.entries()) {
    await db.update(options).set({ label: optionLabel(i), sort: i }).where(eq(options.id, o.id))
  }
  revalidatePath(`/studio/jobs/${ctx.job.id}`)
}

// ── Renders ───────────────────────────────────────────────────────────────────

const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/

/** Called by the browser after a file has finished uploading to Blob. */
export async function addRender(optionId: string, blob: { url: string; pathname: string }, width?: number, height?: number) {
  const session = await requireStaff()
  const ctx = await getOptionContext(optionId)
  if (!ctx) throw new Error('Option not found.')
  await draftVersionOrThrow(ctx.version.id)
  if (!BLOB_HOST.test(new URL(blob.url).hostname)) throw new Error('Unexpected file location.')

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(renders).where(eq(renders.optionId, optionId))
  await db.insert(renders).values({
    optionId, blobUrl: blob.url, blobPath: blob.pathname,
    width: width ?? null, height: height ?? null, sort: n, uploadedBy: session.staffId,
  })
  revalidatePath(`/studio/jobs/${ctx.job.id}`)
}

export async function removeRender(renderId: string) {
  await requireStaff()
  const [r] = await db.select().from(renders).where(eq(renders.id, renderId))
  if (!r) return
  const ctx = await getOptionContext(r.optionId)
  if (!ctx) return
  await draftVersionOrThrow(ctx.version.id)
  await db.delete(renders).where(eq(renders.id, renderId))
  await del(r.blobPath).catch(err => console.error('[removeRender] blob delete:', err))
  revalidatePath(`/studio/jobs/${ctx.job.id}`)
}

/** Moves a render one place earlier or later within its option. */
export async function moveRender(renderId: string, direction: -1 | 1) {
  await requireStaff()
  const [r] = await db.select().from(renders).where(eq(renders.id, renderId))
  if (!r) return
  const ctx = await getOptionContext(r.optionId)
  if (!ctx) return
  await draftVersionOrThrow(ctx.version.id)
  const list = await db.select().from(renders).where(eq(renders.optionId, r.optionId))
    .orderBy(asc(renders.sort), asc(renders.createdAt))
  const i = list.findIndex(x => x.id === renderId), j = i + direction
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  for (const [k, x] of list.entries()) await db.update(renders).set({ sort: k }).where(eq(renders.id, x.id))
  revalidatePath(`/studio/jobs/${ctx.job.id}`)
}

// ── Publish ───────────────────────────────────────────────────────────────────

export type PublishResult = {
  ok: boolean
  error?: string
  reviewUrl?: string
  trello?: MoveResult | { moved: false; reason: string; currentList: string }
  doNotEmail?: boolean
}

/**
 * Publishes a draft version: it becomes visible to the customer, the card gets
 * the "Review App" label (so the old Zap ignores it) and moves to the same
 * designer's Revision list. Customer emails arrive in Phase 4; until then
 * staff copy the link shown after publishing.
 */
export async function publishVersion(versionId: string): Promise<PublishResult> {
  const session = await requireStaff()
  const v = await draftVersionOrThrow(versionId)
  const [job] = await db.select().from(jobs).where(eq(jobs.id, v.jobId))
  const [full] = (await loadVersions(v.jobId)).filter(x => x.id === versionId)

  const empty = full.options.filter(o => o.renders.length === 0)
  if (empty.length) {
    return { ok: false, error: `Add at least one render to ${empty.map(o => `Option ${o.label}`).join(' and ')} first.` }
  }
  // Publishing out of order would confuse customers (e.g. V3 before V2)
  const [earlierDraft] = await db.select({ id: versions.id }).from(versions)
    .where(and(eq(versions.jobId, v.jobId), eq(versions.status, 'draft'), ne(versions.id, versionId), sql`${versions.number} < ${v.number}`))
  if (earlierDraft) return { ok: false, error: 'Publish or delete the earlier draft version first.' }

  // Conditional update so a double-click can't publish (and notify) twice
  const claimed = await db.update(versions)
    .set({ status: 'published', publishedAt: new Date(), publishedBy: session.staffId })
    .where(and(eq(versions.id, versionId), eq(versions.status, 'draft')))
    .returning({ id: versions.id })
  if (claimed.length === 0) return { ok: false, error: 'This version has already been published.' }
  await db.update(jobs).set({ status: 'in_review', updatedAt: new Date() }).where(eq(jobs.id, job.id))

  // Trello: label first, and only move if labelling worked — otherwise the
  // old "card moved → email customer" Zap could fire for this card.
  let trello: PublishResult['trello']
  let doNotEmail = false
  try {
    const card = await getCard(job.trelloCardId)
    if (!card) throw new Error('Trello card not found')
    doNotEmail = cardHasLabel(card, LABEL_DO_NOT_EMAIL)
    await ensureLabel(card, LABEL_REVIEW_APP)
    trello = await moveCardToStage(card.id, 'Revision')
  } catch (err) {
    trello = { moved: false, reason: err instanceof Error ? err.message : String(err), currentList: '' }
  }

  const url = reviewUrl(job)
  await logEvent(job.id, session.staffId, 'version_published', { number: v.number, trello })
  await emitWebhook(job.id, 'version_published', {
    job: {
      id: job.id, cardId: job.trelloCardId, cardUrl: job.trelloShortUrl,
      customerName: job.customerName, customerEmail: job.customerEmail, reviewUrl: url,
    },
    version: {
      number: v.number, title: versionTitle(v.number), note: full.designerNote,
      options: full.options.map(o => ({ label: o.label, renders: o.renders.map(r => r.blobUrl) })),
    },
    ringSize: { value: job.ringSize, status: job.ringSizeStatus },
    doNotEmail,
    trello,
    actor: { type: 'staff', name: session.name },
  })

  revalidatePath(`/studio/jobs/${job.id}`)
  revalidatePath(`/r/${job.publicCode}`)
  return { ok: true, reviewUrl: url, trello, doNotEmail }
}
