'use server'

import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { put } from '@vercel/blob'
import { db, decisions, jobs, options, renders, staff, versions, type Annotation, type ChangeRequest } from '@/lib/db'
import { emitWebhook, logEvent } from '@/lib/events'
import { jobPayload } from '@/lib/payload'
import { openWaiting } from '@/lib/waiting'
import { siteOrigin } from '@/lib/jobs'
import { versionTitle } from '@/lib/format'
import { areaLabel, CHANGE_AREAS } from '@/lib/feedback'
import { addComment, getCard, moveCardToStage, writeRingSizeFields, type MoveResult } from '@/lib/trello'
import type { Stroke } from '@/components/DrawingCanvas'

type Result = { ok: true } | { ok: false; error: string }

// Customers aren't signed in: the unguessable code in their link is the key.
async function jobForCode(code: string) {
  const [row] = await db.select({ job: jobs, designerName: staff.name })
    .from(jobs).leftJoin(staff, eq(staff.id, jobs.designerId))
    .where(eq(jobs.publicCode, code))
  if (!row) throw new Error('This review link isn’t valid.')
  return row
}

async function latestPublished(jobId: string) {
  const [v] = await db.select().from(versions)
    .where(and(eq(versions.jobId, jobId), eq(versions.status, 'published')))
    .orderBy(desc(versions.number)).limit(1)
  return v ?? null
}

const studioLink = (jobId: string) => `${siteOrigin()}/studio/jobs/${jobId}`

// ── Ring size ─────────────────────────────────────────────────────────────────

export async function submitRingSize(code: string, rawSize: string): Promise<Result> {
  const { job, designerName } = await jobForCode(code)
  const size = rawSize.trim().slice(0, 40)
  if (!size) return { ok: false, error: 'Please choose or enter your ring size.' }
  if (job.ringSizeStatus === 'confirmed') return { ok: false, error: 'Your ring size has already been confirmed.' }

  const [updated] = await db.update(jobs)
    .set({ ringSize: size, ringSizeStatus: 'submitted', ringSizeSubmittedAt: new Date(), updatedAt: new Date() })
    .where(eq(jobs.id, job.id)).returning()

  try {
    const card = await getCard(job.trelloCardId)
    if (card) {
      await writeRingSizeFields(card, size, 'Customer submitted')
      await addComment(card.id, `Customer submitted their finger size: ${size}\nPlease confirm it in the studio: ${studioLink(job.id)}`)
    }
  } catch (err) {
    console.error('[submitRingSize] Trello:', err)
  }

  await openWaiting(job.id, 'ring_size')
  await logEvent(job.id, null, 'ring_size_submitted', { size })
  await emitWebhook(job.id, 'ring_size_submitted', { ...jobPayload(updated, designerName), actor: { type: 'customer' } })
  revalidatePath(`/r/${code}`)
  return { ok: true }
}

// ── Drawings ──────────────────────────────────────────────────────────────────

/**
 * Saves one annotated render (render + drawing flattened to JPEG). Called once
 * per drawing before the decision is submitted, so each request stays small.
 */
export async function uploadAnnotation(code: string, form: FormData): Promise<{ drawingUrl: string; renderUrl: string } | { error: string }> {
  const { job } = await jobForCode(code)
  const renderId = String(form.get('renderId') ?? '')
  const file = form.get('file')
  if (!(file instanceof Blob) || file.type !== 'image/jpeg') return { error: 'Drawing upload failed.' }
  if (file.size > 3.5 * 1024 * 1024) return { error: 'That drawing is too large to upload.' }

  const latest = await latestPublished(job.id)
  const [r] = await db.select({ render: renders, versionId: options.versionId })
    .from(renders).innerJoin(options, eq(options.id, renders.optionId))
    .where(eq(renders.id, renderId))
  if (!latest || !r || r.versionId !== latest.id) return { error: 'You can only draw on the latest version.' }

  const blob = await put(`annotations/${job.id}/v${latest.number}/${renderId}.jpg`, file, {
    access: 'public', addRandomSuffix: true, contentType: 'image/jpeg',
  })
  return { drawingUrl: blob.url, renderUrl: r.render.blobUrl }
}

// ── Approve / request changes ─────────────────────────────────────────────────

export type DecisionInput = {
  versionId: string
  decision: 'approved' | 'changes_requested'
  optionId: string | null
  changes: ChangeRequest[]
  comments: string
  annotations: { renderId: string; drawingUrl: string; strokes: Stroke[] }[]
}

const AREA_KEYS = new Set<string>(CHANGE_AREAS.map(a => a.key))

export async function submitDecision(code: string, input: DecisionInput): Promise<Result> {
  const { job, designerName } = await jobForCode(code)
  const latest = await latestPublished(job.id)
  if (!latest || latest.id !== input.versionId) {
    return { ok: false, error: 'A newer version is available. Please refresh the page.' }
  }

  const versionOptions = await db.select().from(options).where(eq(options.versionId, latest.id))
  const option = input.optionId ? versionOptions.find(o => o.id === input.optionId) ?? null : null
  if (input.optionId && !option) return { ok: false, error: 'Please choose one of the options shown.' }
  if (input.decision === 'approved' && versionOptions.length > 1 && !option) {
    return { ok: false, error: 'Please choose which option you’re approving.' }
  }

  const changes = input.decision === 'changes_requested'
    ? input.changes
        .filter(c => AREA_KEYS.has(c.area))
        .map(c => ({ area: c.area, note: String(c.note ?? '').trim().slice(0, 2000) }))
    : []
  const comments = input.comments.trim().slice(0, 4000)

  // Drawings must be on this version's renders and stored under this job
  const versionRenders = await db.select({ id: renders.id, url: renders.blobUrl }).from(renders)
    .innerJoin(options, eq(options.id, renders.optionId))
    .where(eq(options.versionId, latest.id))
  const annotations: Annotation[] = []
  for (const a of input.annotations.slice(0, 12)) {
    const render = versionRenders.find(r => r.id === a.renderId)
    const url = new URL(a.drawingUrl)
    if (!render || !url.hostname.endsWith('.public.blob.vercel-storage.com') || !url.pathname.startsWith(`/annotations/${job.id}/`)) continue
    annotations.push({ renderId: render.id, renderUrl: render.url, drawingUrl: a.drawingUrl, strokes: limitStrokes(a.strokes) })
  }

  if (input.decision === 'changes_requested' && !changes.some(c => c.note) && !comments && annotations.length === 0) {
    return { ok: false, error: 'Please tell us what you’d like changed.' }
  }

  // One decision per version; the unique index stops a double-tap creating two
  const inserted = await db.insert(decisions).values({
    jobId: job.id, versionId: latest.id, optionId: option?.id ?? null,
    decision: input.decision, changes, comments: comments || null, annotations,
  }).onConflictDoNothing({ target: decisions.versionId }).returning()
  if (inserted.length === 0) return { ok: false, error: 'We’ve already received your response to this version.' }

  const approved = input.decision === 'approved'
  const [updated] = await db.update(jobs)
    .set({ status: approved ? 'approved' : 'changes_requested', updatedAt: new Date() })
    .where(eq(jobs.id, job.id)).returning()

  // Trello: same designer's Print Ready / Alterations list, plus a summary comment
  let trello: MoveResult | { moved: false; reason: string; currentList: string }
  try {
    trello = await moveCardToStage(job.trelloCardId, approved ? 'Print Ready' : 'Alterations')
    const optionText = option && versionOptions.length > 1 ? `, Option ${option.label}` : ''
    const lines = approved
      ? [`Customer APPROVED ${versionTitle(latest.number)}${optionText}.`]
      : [`Customer requested changes to ${versionTitle(latest.number)}${optionText ? ` (closest: ${optionText.slice(2)})` : ''}:`,
         ...changes.filter(c => c.note).map(c => `• ${areaLabel(c.area)}: ${c.note}`)]
    if (comments) lines.push(`Comments: ${comments}`)
    if (annotations.length) lines.push(`Drawings: ${annotations.map(a => a.drawingUrl).join(' ')}`)
    lines.push(`Studio: ${studioLink(job.id)}`)
    await addComment(job.trelloCardId, lines.join('\n'))
  } catch (err) {
    trello = { moved: false, reason: err instanceof Error ? err.message : String(err), currentList: '' }
  }

  await openWaiting(job.id, 'decision')
  await logEvent(job.id, null, approved ? 'design_approved' : 'changes_requested', { version: latest.number, trello })
  await emitWebhook(job.id, 'decision_submitted', {
    ...jobPayload(updated, designerName),
    decision: {
      type: input.decision,
      version: { number: latest.number, title: versionTitle(latest.number) },
      option: option ? { label: option.label } : null,
      optionCount: versionOptions.length,
      changes: changes.map(c => ({ ...c, label: areaLabel(c.area) })),
      comments: comments || null,
      // Strokes stay in the database; Zapier gets the images
      drawings: annotations.map(a => ({ renderUrl: a.renderUrl, drawingUrl: a.drawingUrl })),
    },
    trello,
    actor: { type: 'customer' },
  })

  // No revalidatePath here: any revalidation refreshes the customer's page
  // immediately, which would unmount the thank-you screen before it's seen.
  // The page refreshes when they close it; staff pages are always dynamic.
  return { ok: true }
}

/** Caps stored stroke data (~5,000 points per drawing) and drops malformed input. */
function limitStrokes(strokes: unknown): Stroke[] {
  if (!Array.isArray(strokes)) return []
  let budget = 5000
  const out: Stroke[] = []
  for (const s of strokes.slice(0, 200)) {
    if (!s || typeof s !== 'object' || !Array.isArray((s as Stroke).points)) continue
    const pts = (s as Stroke).points
      .filter(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && n >= 0 && n <= 1))
      .slice(0, budget) as [number, number][]
    budget -= pts.length
    out.push({ color: String((s as Stroke).color).slice(0, 9), width: Number((s as Stroke).width) || 0.005, points: pts })
    if (budget <= 0) break
  }
  return out
}
