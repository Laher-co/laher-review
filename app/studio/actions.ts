'use server'

import { and, asc, eq, isNull, max, ne, sql } from 'drizzle-orm'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { del } from '@vercel/blob'
import { db, escalations, jobs, messages, options, renders, staff, versions, waiting } from '@/lib/db'
import { checkStaffPassword, requireStaff } from '@/lib/auth'
import { SESSION_COOKIE, SESSION_DAYS, signSession } from '@/lib/session'
import { emitWebhook, logEvent } from '@/lib/events'
import { getOptionContext, loadVersions, newPublicCode, reviewUrl, siteOrigin } from '@/lib/jobs'
import { escapeHtml, staffEmailHtml, staffEmails } from '@/lib/email'
import { optionLabel, versionTitle } from '@/lib/format'
import {
  cardFunnel, cardHasLabel, getCard, LABEL_DO_NOT_EMAIL, LABEL_REVIEW_APP, readRingSizeFields, type MoveResult,
} from '@/lib/trello'
import { moveOutcome, retryIssue, setIssueStatus, tracked } from '@/lib/issues'
import { jobPayload } from '@/lib/payload'
import { cardDetails, createJobFromDetails, type CardPreview } from '@/lib/job-create'
import { backfillDesigner, type LinkResult } from '@/lib/studio-links'
import { answerWaiting, markHandled } from '@/lib/waiting'
import { closeFollowup, startDesignFollowup, stopFollowups } from '@/lib/followups'
import { emailContext, sendCustomerEmail } from '@/lib/customer-emails'
import { staffReplied, versionReady } from '@/lib/customer-email-templates'
import { extractEmail, descriptionSection } from '@/lib/trello-parse'

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

export type { CardPreview } from '@/lib/job-create'

/** Reads a Trello card so staff can check the details before creating a job. */
export async function previewCard(ref: string): Promise<{ preview?: CardPreview; error?: string }> {
  await requireStaff()
  const card = await getCard(ref)
  if (!card) return { error: 'Couldn’t find that Trello card. Paste the card’s link from Trello.' }
  return { preview: await cardDetails(card) }
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

  const jobId = await createJobFromDetails(preview, {
    customerName, customerEmail, designerId, createdBy: session.staffId, via: 'new_job_form',
  })
  redirect(`/studio/jobs/${jobId}`)
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
  customerEmail?: 'sent' | 'skipped' | 'failed'
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
  // A new version answers what the customer was waiting on (e.g. a change request)
  await answerWaiting(job.id, session.staffId)

  // Trello: label first, and only move if labelling worked — otherwise the
  // old "card moved → email customer" Zap could fire for this card. Both run
  // as one tracked step, so a failure becomes an issue with a Retry button.
  const card = await getCard(job.trelloCardId).catch(() => null)
  const doNotEmail = job.doNotEmail || (card ? cardHasLabel(card, LABEL_DO_NOT_EMAIL) : false)
  const trello: PublishResult['trello'] = moveOutcome(await tracked('trello_move', job.id,
    `Label the card “${LABEL_REVIEW_APP}” and move it to Revision (${versionTitle(v.number)} published)`,
    { type: 'trello.labelAndMove', args: { cardId: job.trelloCardId, label: LABEL_REVIEW_APP, stage: 'Revision' } }))

  // Email the customer (skipped if the card says "Do not email") and start the follow-up clock
  const { common } = await emailContext(job.id)
  const sent = await sendCustomerEmail(job.id, 'version_ready', versionReady({
    ...common, versionTitle: versionTitle(v.number), versionNumber: v.number,
    optionCount: full.options.length, note: full.designerNote,
  }))
  const customerEmail: PublishResult['customerEmail'] = sent.ok ? sent.value : 'failed'
  await startDesignFollowup(job.id, v.number)

  const url = reviewUrl(job)
  await logEvent(job.id, session.staffId, 'version_published', { number: v.number, trello, customerEmail })
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
  return { ok: true, reviewUrl: url, trello, doNotEmail, customerEmail }
}

// ── Ring size ─────────────────────────────────────────────────────────────────

/** Only staff can mark a ring size confirmed. */
export async function confirmRingSize(jobId: string, rawSize: string) {
  const session = await requireStaff()
  const size = rawSize.trim().slice(0, 40)
  if (!size) throw new Error('Enter the ring size to confirm.')

  const [before] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId))
  if (!before) throw new Error('Job not found.')
  // An approval that was waiting on the ring size can now go ahead
  const releasesApproval = before.status === 'approved_size_needed'

  const [job] = await db.update(jobs).set({
    ringSize: size, ringSizeStatus: 'confirmed',
    ringSizeConfirmedBy: session.staffId, ringSizeConfirmedAt: new Date(), updatedAt: new Date(),
    ...(releasesApproval ? { status: 'approved' as const } : {}),
  }).where(eq(jobs.id, jobId)).returning()

  // Confirming the size answers the job (unless a message is still unanswered)
  await answerWaiting(jobId, session.staffId)
  await stopFollowups(jobId, ['size'], 'Ring size confirmed')

  const cardId = job.trelloCardId
  await tracked('trello_fields', job.id, `Set the Finger Size fields to ${size} (Confirmed)`,
    { type: 'trello.ringFields', args: { cardId, size, status: 'Confirmed' } })
  await tracked('trello_label', job.id, 'Remove the “Finger Size TBC” label',
    { type: 'trello.removeLabel', args: { cardId, name: 'Finger Size TBC' } })
  await tracked('trello_comment', job.id, 'Post the ring size confirmation comment', {
    type: 'trello.comment', args: { cardId, text: releasesApproval
      ? `**RING SIZE CONFIRMED: ${size}** (by ${session.name})\n\nThe approved design can now go ahead: moving to Print Ready.`
      : `Finger size confirmed: ${size} (by ${session.name})` },
  })
  const trello: MoveResult | ReturnType<typeof moveOutcome> | null = releasesApproval
    ? moveOutcome(await tracked('trello_move', job.id, 'Move the approved card to Print Ready (size now confirmed)',
        { type: 'trello.move', args: { cardId, stage: 'Print Ready' } }))
    : null

  const [designer] = job.designerId
    ? await db.select({ name: staff.name }).from(staff).where(eq(staff.id, job.designerId)) : []
  await logEvent(job.id, session.staffId, 'ring_size_confirmed', { size, releasesApproval, trello })
  await emitWebhook(job.id, 'ring_size_confirmed', { ...jobPayload(job, designer?.name ?? null), actor: { type: 'staff', name: session.name } })
  revalidatePath(`/studio/jobs/${jobId}`)
  revalidatePath(`/r/${job.publicCode}`)
}

// ── Issues ────────────────────────────────────────────────────────────────────

export async function retryIssueAction(issueId: string) {
  const session = await requireStaff()
  const res = await retryIssue(issueId, session.staffId)
  revalidatePath('/studio/issues')
  return res
}

export async function setIssueStatusAction(issueId: string, status: 'resolved' | 'ignored' | 'open') {
  const session = await requireStaff()
  await setIssueStatus(issueId, status, session.staffId)
  revalidatePath('/studio/issues')
}

// ── Messages ──────────────────────────────────────────────────────────────────

/** A staff reply on a version's thread or the general thread. Answers the job's queue item. */
export async function sendStaffReply(jobId: string, versionId: string | null, rawBody: string) {
  const session = await requireStaff()
  const body = rawBody.trim().slice(0, 4000)
  if (!body) throw new Error('Write a reply first.')
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId))
  if (!job) throw new Error('Job not found.')
  let version: typeof versions.$inferSelect | undefined
  if (versionId) {
    ;[version] = await db.select().from(versions)
      .where(and(eq(versions.id, versionId), eq(versions.jobId, jobId), eq(versions.status, 'published')))
    if (!version) throw new Error('That version isn’t published.')
  }

  const [msg] = await db.insert(messages).values({
    jobId, versionId: version?.id ?? null, author: 'staff', staffId: session.staffId, body,
  }).returning()
  await db.update(jobs).set({ updatedAt: new Date() }).where(eq(jobs.id, jobId))

  // A reply answers the job's queue item, unless another thread is still unanswered
  await answerWaiting(jobId, session.staffId)

  const where = version ? versionTitle(version.number) : 'General'
  await tracked('trello_comment', jobId, `Post ${session.name}’s reply (${where}) on the Trello card`, {
    type: 'trello.comment',
    args: { cardId: job.trelloCardId, text: `**STUDIO REPLY (${session.name}): ${where}**\n\n${body}` },
  })

  const { common } = await emailContext(jobId)
  await sendCustomerEmail(jobId, 'staff_replied', staffReplied({ ...common, staffName: session.name, body }))

  const [designer] = job.designerId ? await db.select({ name: staff.name }).from(staff).where(eq(staff.id, job.designerId)) : []
  await logEvent(jobId, session.staffId, 'staff_reply', { messageId: msg.id, version: version?.number ?? null })
  await emitWebhook(jobId, 'message_created', {
    ...jobPayload(job, designer?.name ?? null),
    message: {
      id: msg.id, author: 'staff', staffName: session.name,
      thread: version ? 'version' : 'general',
      version: version ? { number: version.number, title: versionTitle(version.number) } : null,
      body, drawings: [],
    },
    actor: { type: 'staff', name: session.name },
  })
  revalidatePath(`/studio/jobs/${jobId}`)
  revalidatePath(`/r/${job.publicCode}`)
}

// ── Settings: designers on LAHER Studio ───────────────────────────────────────

export type BackfillReport = { list: string | null; results: { card: string; result: LinkResult }[] }

async function requireOwner() {
  const session = await requireStaff()
  const [me] = await db.select({ role: staff.role }).from(staff).where(eq(staff.id, session.staffId))
  if (me?.role !== 'owner') throw new Error('Only Ryan can change which designers are on LAHER Studio.')
  return session
}

/**
 * Switches a designer onto (or off) the new system. Switching on runs the
 * backfill: "Open in LAHER Studio" links on cards currently in their New
 * Design Renders list only. Switching off adds no new links; existing ones stay.
 */
export async function setDesignerOnStudio(staffId: string, on: boolean): Promise<BackfillReport | null> {
  const session = await requireOwner()
  const [d] = await db.update(staff).set({ onStudio: on })
    .where(and(eq(staff.id, staffId), eq(staff.role, 'designer'))).returning()
  if (!d) throw new Error('Designer not found.')
  await logEvent(null, session.staffId, on ? 'designer_enabled' : 'designer_disabled', { designer: d.name })
  revalidatePath('/studio/settings')
  return on ? backfillDesigner(d.name) : null
}

export async function runBackfill(staffId: string): Promise<BackfillReport> {
  await requireOwner()
  const [d] = await db.select().from(staff).where(eq(staff.id, staffId))
  if (!d?.onStudio) throw new Error('Switch the designer on first.')
  return backfillDesigner(d.name)
}

// ── Queue ─────────────────────────────────────────────────────────────────────

/** "Mark handled": nothing to reply to (e.g. an approval), so stop the timer. */
export async function markHandledAction(jobId: string) {
  const session = await requireStaff()
  if (await markHandled(jobId, session.staffId)) await logEvent(jobId, session.staffId, 'marked_handled')
  revalidatePath(`/studio/jobs/${jobId}`)
  revalidatePath('/studio')
}

// ── Escalations ───────────────────────────────────────────────────────────────

/** Flags the job for Rach and emails her. */
export async function escalateJob(jobId: string, rawNote: string) {
  const session = await requireStaff()
  const note = rawNote.trim().slice(0, 2000)
  if (!note) throw new Error('Add a short note for Rach.')
  const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId))
  if (!job) throw new Error('Job not found.')
  const [open] = await db.select({ id: escalations.id }).from(escalations)
    .where(and(eq(escalations.jobId, jobId), isNull(escalations.resolvedAt)))
  if (open) throw new Error('This job is already escalated.')

  await db.insert(escalations).values({ jobId, raisedBy: session.staffId, note })
  const link = `${siteOrigin()}/studio/jobs/${jobId}`
  await tracked('email_send', jobId, `Email Rach about the escalation (${job.customerName})`, {
    type: 'email.send',
    args: {
      to: await staffEmails(['escalations']), type: 'escalation', jobId, replyTo: 'hello@leiedesign.com',
      subject: `Escalated to you: ${job.customerName} (from ${session.name})`,
      text: `${session.name} escalated ${job.customerName}:\n\n${note}\n\nOpen the job: ${link}`,
      html: staffEmailHtml(`Escalated: ${escapeHtml(job.customerName)}`,
        `<p>${escapeHtml(session.name)} escalated this job to you:</p>
         <p style="white-space:pre-line;background:#F1EAE0;border-radius:8px;padding:12px 14px">${escapeHtml(note)}</p>`,
        { href: link, label: 'Open the job' }),
    },
  })
  await tracked('trello_comment', jobId, 'Post the escalation on the Trello card',
    { type: 'trello.comment', args: { cardId: job.trelloCardId, text: `**ESCALATED TO RACH** (by ${session.name})\n\n${note}` } })
  await logEvent(jobId, session.staffId, 'escalated', { note })
  revalidatePath(`/studio/jobs/${jobId}`)
  revalidatePath('/studio')
}

export async function resolveEscalation(escalationId: string, rawNote: string) {
  const session = await requireStaff()
  const note = rawNote.trim().slice(0, 2000)
  const [e] = await db.update(escalations)
    .set({ resolvedAt: new Date(), resolvedBy: session.staffId, resolutionNote: note || null })
    .where(and(eq(escalations.id, escalationId), isNull(escalations.resolvedAt))).returning()
  if (!e) return
  const [job] = await db.select().from(jobs).where(eq(jobs.id, e.jobId))
  if (job) {
    await tracked('trello_comment', job.id, 'Post the escalation resolution on the Trello card', {
      type: 'trello.comment', args: { cardId: job.trelloCardId, text: `**ESCALATION RESOLVED** (by ${session.name})${note ? `\n\n${note}` : ''}` },
    })
  }
  await logEvent(e.jobId, session.staffId, 'escalation_resolved', { note })
  revalidatePath(`/studio/jobs/${e.jobId}`)
  revalidatePath('/studio')
}

// ── Follow-ups ────────────────────────────────────────────────────────────────

/** "Log call": staff followed up by phone (or otherwise); clears the flag. */
export async function logFollowupCall(followupId: string, note: string) {
  const session = await requireStaff()
  const f = await closeFollowup(followupId, session.staffId, note.trim().slice(0, 2000))
  if (f) {
    await logEvent(f.jobId, session.staffId, 'followup_logged', { note })
    revalidatePath(`/studio/jobs/${f.jobId}`)
  }
  revalidatePath('/studio')
}

// ── Customer emails ───────────────────────────────────────────────────────────

/** The "Do not email" switch: also adds or removes the label on the Trello card. */
export async function setDoNotEmail(jobId: string, on: boolean) {
  const session = await requireStaff()
  const [job] = await db.update(jobs).set({ doNotEmail: on, updatedAt: new Date() }).where(eq(jobs.id, jobId)).returning()
  if (!job) throw new Error('Job not found.')
  await tracked('trello_label', jobId, `${on ? 'Add' : 'Remove'} the “Do not email” label ${on ? 'on' : 'from'} the Trello card`,
    { type: on ? 'trello.addLabel' : 'trello.removeLabel', args: { cardId: job.trelloCardId, name: LABEL_DO_NOT_EMAIL } })
  await logEvent(jobId, session.staffId, on ? 'do_not_email_on' : 'do_not_email_off', { source: 'studio' })
  revalidatePath(`/studio/jobs/${jobId}`)
  revalidatePath('/studio')
}

/** The customer answered by email to the shop (not through the app): stop reminders and note it. */
export async function customerRepliedByEmail(jobId: string, rawNote: string) {
  const session = await requireStaff()
  const note = rawNote.trim().slice(0, 2000)
  await stopFollowups(jobId, ['design'], `Customer replied by email (logged by ${session.name})`)
  await logEvent(jobId, session.staffId, 'customer_replied_by_email', { note: note || null })
  revalidatePath(`/studio/jobs/${jobId}`)
  revalidatePath('/studio')
}
