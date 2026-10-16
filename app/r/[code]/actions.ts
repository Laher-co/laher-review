'use server'

import { and, eq, gt, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { put } from '@vercel/blob'
import { db, decisions, jobs, messages, options, renders, staff, versions, type Annotation, type ChangeRequest } from '@/lib/db'
import { emitWebhook, logEvent } from '@/lib/events'
import { jobPayload } from '@/lib/payload'
import { openWaiting } from '@/lib/waiting'
import { alertCustomerAction } from '@/lib/alerts'
import { recordCustomerMessage } from '@/lib/customer-message'
import { startSizeFollowup, stopFollowups } from '@/lib/followups'
import { emailContext, sendCustomerEmail } from '@/lib/customer-emails'
import { approvedSummary, changesSummary } from '@/lib/customer-email-templates'
import { siteOrigin } from '@/lib/jobs'
import { versionTitle } from '@/lib/format'
import { areaLabel, CHANGE_AREAS, decisionHeading } from '@/lib/feedback'
import { moveOutcome, tracked } from '@/lib/issues'
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

/** A published version of this job (any version, not just the latest). */
async function publishedVersion(jobId: string, versionId: string) {
  const [v] = await db.select().from(versions)
    .where(and(eq(versions.id, versionId), eq(versions.jobId, jobId), eq(versions.status, 'published')))
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

  const cardId = job.trelloCardId
  await tracked('trello_fields', job.id, `Set the Finger Size fields to ${size} (Customer submitted)`,
    { type: 'trello.ringFields', args: { cardId, size, status: 'Customer submitted' } })
  await tracked('trello_comment', job.id, 'Post the customer’s ring size comment', {
    type: 'trello.comment',
    args: { cardId, text: `Customer submitted their finger size: ${size}\nPlease confirm it in the studio: ${studioLink(job.id)}` },
  })

  await stopFollowups(job.id, ['design', 'size'], 'Customer sent their ring size')
  await openWaiting(job.id, 'ring_size')
  await alertCustomerAction(job.id, 'Ring size submitted', `The customer says their ring size is ${size}. Please check it and confirm it in the studio.`)
  await logEvent(job.id, null, 'ring_size_submitted', { size })
  await emitWebhook(job.id, 'ring_size_submitted', { ...jobPayload(updated, designerName), actor: { type: 'customer' } })
  revalidatePath(`/r/${code}`)
  return { ok: true }
}

// ── Drawings ──────────────────────────────────────────────────────────────────

/**
 * Saves one annotated render (render + drawing flattened to JPEG). Called once
 * per drawing before the change request is submitted, so each request stays small.
 */
export async function uploadAnnotation(code: string, form: FormData): Promise<{ drawingUrl: string; renderUrl: string } | { error: string }> {
  const { job } = await jobForCode(code)
  const renderId = String(form.get('renderId') ?? '')
  const file = form.get('file')
  if (!(file instanceof Blob) || file.type !== 'image/jpeg') return { error: 'Drawing upload failed.' }
  if (file.size > 3.5 * 1024 * 1024) return { error: 'That drawing is too large to upload.' }

  const [r] = await db.select({ render: renders, version: versions })
    .from(renders)
    .innerJoin(options, eq(options.id, renders.optionId))
    .innerJoin(versions, eq(versions.id, options.versionId))
    .where(and(eq(renders.id, renderId), eq(versions.jobId, job.id), eq(versions.status, 'published')))
  if (!r) return { error: 'That image isn’t part of your design.' }

  const blob = await put(`annotations/${job.id}/v${r.version.number}/${renderId}.jpg`, file, {
    access: 'public', addRandomSuffix: true, contentType: 'image/jpeg',
  })
  return { drawingUrl: blob.url, renderUrl: r.render.blobUrl }
}

// ── Approve / request changes ─────────────────────────────────────────────────

export type DecisionInput = {
  clientKey: string                 // one per submission, generated in the browser
  versionId: string
  decision: 'approved' | 'changes_requested'
  optionId: string | null           // required when the version has several options
  changes: ChangeRequest[]
  comments: string
  annotations: { renderId: string; drawingUrl: string; strokes: Stroke[] }[]
  // Asked for on approval when the ring size is still unconfirmed
  ringSize?: { size: string } | { notSure: true }
}

const AREA_KEYS = new Set<string>(CHANGE_AREAS.map(a => a.key))

export async function submitDecision(code: string, input: DecisionInput): Promise<Result> {
  const { job, designerName } = await jobForCode(code)
  const version = await publishedVersion(job.id, input.versionId)
  if (!version) return { ok: false, error: 'That version isn’t available. Please refresh the page.' }
  const approved = input.decision === 'approved'

  // Every response is tied to one version AND one option
  const versionOptions = await db.select().from(options).where(eq(options.versionId, version.id))
  const option = versionOptions.length === 1
    ? versionOptions[0]
    : versionOptions.find(o => o.id === input.optionId) ?? null
  if (!option) return { ok: false, error: 'Please choose which option this is about.' }

  const changes = approved ? [] : input.changes
    .filter(c => AREA_KEYS.has(c.area))
    .map(c => ({ area: c.area, note: String(c.note ?? '').trim().slice(0, 2000) }))
  const comments = input.comments.trim().slice(0, 4000)

  const annotations = approved ? [] : await checkedAnnotations(job.id, version.id, input.annotations)

  if (!approved && !changes.some(c => c.note) && !comments && annotations.length === 0) {
    return { ok: false, error: 'Please tell us what you’d like changed.' }
  }

  // Ring size: an unconfirmed size must be given (or "not sure") when approving
  let submittedSize: string | null = null
  let sizeOutstanding = false
  if (approved && job.ringSizeStatus === 'unconfirmed') {
    if (input.ringSize && 'size' in input.ringSize && input.ringSize.size.trim()) {
      submittedSize = input.ringSize.size.trim().slice(0, 40)
    } else if (input.ringSize && 'notSure' in input.ringSize) {
      sizeOutstanding = true
    } else {
      return { ok: false, error: 'Please add your ring size, or choose “Not sure of my size”.' }
    }
  }

  const inserted = await db.insert(decisions).values({
    jobId: job.id, versionId: version.id, optionId: option.id,
    decision: input.decision, changes, comments: comments || null, annotations,
    sizeOutstanding, clientKey: input.clientKey.slice(0, 64) || null,
  }).onConflictDoNothing({ target: decisions.clientKey }).returning()
  // Same submission arriving twice (double-tap, retry): already recorded
  if (inserted.length === 0) return { ok: true }

  const [updated] = await db.update(jobs).set({
    status: !approved ? 'changes_requested' : sizeOutstanding ? 'approved_size_needed' : 'approved',
    ...(submittedSize ? { ringSize: submittedSize, ringSizeStatus: 'submitted' as const, ringSizeSubmittedAt: new Date() } : {}),
    updatedAt: new Date(),
  }).where(eq(jobs.id, job.id)).returning()

  const heading = decisionHeading({
    decision: input.decision, sizeOutstanding, versionTitle: versionTitle(version.number),
    optionLabel: option.label, optionCount: versionOptions.length,
  })

  // Trello: bold header first, then the changes, then the drawings. The card
  // moves to the same designer's Alterations / Print Ready list — except an
  // approval without a ring size, which waits for staff to confirm one.
  // Blocks separated by one blank line: header, changes, comments, size, drawings
  const blocks = [`**${heading}**`]
  const notes = changes.filter(c => c.note).map(c => `• **${areaLabel(c.area)}:** ${c.note}`)
  if (notes.length) blocks.push(notes.join('\n'))
  if (comments) blocks.push(`Comments: ${comments}`)
  if (submittedSize) blocks.push(`Ring size from customer: ${submittedSize} (awaiting confirmation)`)
  if (sizeOutstanding) blocks.push('Customer isn’t sure of their ring size. The card stays here until staff confirm a size in the studio.')
  if (annotations.length) blocks.push([`Drawing${annotations.length > 1 ? 's' : ''}:`, ...annotations.map(a => a.drawingUrl)].join('\n'))
  blocks.push(`Studio: ${studioLink(job.id)}`)
  const cardId = job.trelloCardId
  await tracked('trello_comment', job.id, `Post “${heading}” on the Trello card`,
    { type: 'trello.comment', args: { cardId, text: blocks.join('\n\n') } })
  for (const [i, a] of annotations.entries()) {
    const name = `Drawing ${i + 1} – ${heading.replace('CHANGES REQUESTED: ', '')}`
    await tracked('trello_attachment', job.id, `Attach ${name} to the Trello card`,
      { type: 'trello.attach', args: { cardId, url: a.drawingUrl, name } })
  }
  if (submittedSize) {
    await tracked('trello_fields', job.id, `Set the Finger Size fields to ${submittedSize} (Customer submitted)`,
      { type: 'trello.ringFields', args: { cardId, size: submittedSize, status: 'Customer submitted' } })
  }
  const trello = sizeOutstanding
    ? { moved: false as const, reason: 'Approved without a ring size: waiting for staff to confirm one', currentList: '' }
    : moveOutcome(await tracked('trello_move', job.id,
        `Move the card to ${approved ? 'Print Ready' : 'Alterations'} (${heading})`,
        { type: 'trello.move', args: { cardId, stage: approved ? 'Print Ready' : 'Alterations' } }))

  await stopFollowups(job.id, ['design'], approved ? 'Customer approved' : 'Customer requested changes')
  if (sizeOutstanding) await startSizeFollowup(job.id)

  // Summary email: what they asked for and what happens next
  const { common } = await emailContext(job.id)
  const what = `${versionTitle(version.number)}${versionOptions.length > 1 ? `, Option ${option.label}` : ''}`
  await sendCustomerEmail(job.id, approved ? 'approved_summary' : 'changes_summary', approved
    ? approvedSummary({ ...common, what, comments: comments || null, sizeOutstanding })
    : changesSummary({
        ...common, what, comments: comments || null, drawings: annotations.length,
        changes: changes.filter(c => c.note).map(c => `${areaLabel(c.area)}: ${c.note}`),
      }))

  await openWaiting(job.id, 'decision')
  await alertCustomerAction(job.id, heading, [
    ...changes.filter(c => c.note).map(c => `${areaLabel(c.area)}: ${c.note}`),
    comments ? `Comments: ${comments}` : '',
    submittedSize ? `Ring size given: ${submittedSize} (please confirm)` : '',
    sizeOutstanding ? 'Not sure of their ring size: please help them confirm it. The card stays put until you do.' : '',
    annotations.length ? `${annotations.length} drawing${annotations.length > 1 ? 's' : ''} attached` : '',
  ].filter(Boolean).join('\n'))
  await logEvent(job.id, null, approved ? 'design_approved' : 'changes_requested', {
    version: version.number, option: option.label, decisionId: inserted[0].id, sizeOutstanding, trello,
  })
  await emitWebhook(job.id, 'decision_submitted', {
    ...jobPayload(updated, designerName),
    decision: {
      type: input.decision,
      heading,
      version: { number: version.number, title: versionTitle(version.number) },
      option: { label: option.label },
      optionCount: versionOptions.length,
      changes: changes.map(c => ({ ...c, label: areaLabel(c.area) })),
      comments: comments || null,
      sizeOutstanding,
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

type AnnotationInput = { renderId: string; drawingUrl: string; strokes: Stroke[] }

/** Keeps only drawings on this version's renders that were uploaded under this job. */
async function checkedAnnotations(jobId: string, versionId: string, input: AnnotationInput[]): Promise<Annotation[]> {
  const versionRenders = await db.select({ id: renders.id, url: renders.blobUrl }).from(renders)
    .innerJoin(options, eq(options.id, renders.optionId))
    .where(eq(options.versionId, versionId))
  const out: Annotation[] = []
  for (const a of input.slice(0, 12)) {
    const render = versionRenders.find(r => r.id === a.renderId)
    let url: URL
    try { url = new URL(a.drawingUrl) } catch { continue }
    if (!render || !url.hostname.endsWith('.public.blob.vercel-storage.com') || !url.pathname.startsWith(`/annotations/${jobId}/`)) continue
    out.push({ renderId: render.id, renderUrl: render.url, drawingUrl: a.drawingUrl, strokes: limitStrokes(a.strokes) })
  }
  return out
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

// ── Messages ──────────────────────────────────────────────────────────────────

export type MessageInput = {
  clientKey: string
  versionId: string | null        // null = the general "message the studio" thread
  body: string
  annotations: AnnotationInput[]  // only on a version's thread
}

/**
 * A customer message, on a version's thread or the general one. Available at
 * every stage (after changes or approval too). Starts the response timer,
 * posts to Trello and sends a v2 webhook.
 */
export async function sendCustomerMessage(code: string, input: MessageInput): Promise<Result> {
  const { job, designerName } = await jobForCode(code)
  const body = input.body.trim().slice(0, 4000)

  const version = input.versionId ? await publishedVersion(job.id, input.versionId) : null
  if (input.versionId && !version) return { ok: false, error: 'That version isn’t available. Please refresh the page.' }
  const annotations = version ? await checkedAnnotations(job.id, version.id, input.annotations) : []
  if (!body && annotations.length === 0) return { ok: false, error: 'Please write a message.' }

  // Simple guard against a runaway script: plenty for a real customer
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(messages)
    .where(and(eq(messages.jobId, job.id), eq(messages.author, 'customer'), gt(messages.createdAt, sql`now() - interval '1 hour'`)))
  if (n >= 30) return { ok: false, error: 'You’ve sent a lot of messages in the last hour. Please try again a little later.' }

  await recordCustomerMessage(job, designerName, {
    version: version ? { id: version.id, number: version.number } : null,
    body, annotations, source: 'page', clientKey: input.clientKey.slice(0, 64) || null,
  })
  revalidatePath(`/r/${code}`)
  return { ok: true }
}
