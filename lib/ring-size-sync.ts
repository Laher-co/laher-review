import 'server-only'
import { eq } from 'drizzle-orm'
import { db, jobs, staff } from './db'
import { emitWebhook, logEvent } from './events'
import { moveOutcome, tracked } from './issues'
import { jobPayload } from './payload'
import { answerWaiting } from './waiting'
import { stopFollowups } from './followups'
import { getCard, readRingSizeFields } from './trello'
import { FIELD_LABEL } from './job-create'
import { descriptionSizeChange, resolveRingSize, type RingStatus } from './ring-size'

export type SizeSource =
  | { kind: 'description'; oldDesc: string }   // someone edited the card description
  | { kind: 'fields' }                         // someone changed the Finger Size custom fields

/**
 * Keeps the job's ring size in step with the Trello card (called from the
 * Trello webhook). The latest change wins: the app writes the custom fields
 * when a customer submits or staff confirm, and this picks up anything a
 * person changes on the card afterwards.
 */
export async function syncRingSizeFromCard(cardId: string, source: SizeSource) {
  const card = await getCard(cardId)
  if (!card) return { action: 'skipped', reason: 'card not found' }
  const [job] = await db.select().from(jobs).where(eq(jobs.trelloCardId, card.id))
  if (!job) return { action: 'skipped', reason: 'no job for this card' }

  let reading: { size: string | null; status: RingStatus } | null
  if (source.kind === 'description') {
    reading = descriptionSizeChange(source.oldDesc, card.desc)
    if (!reading) return { action: 'skipped', reason: 'Finger Size section unchanged' }
    // Keep the card's own fields consistent with the description edit
    await tracked('trello_fields', job.id, `Update the Finger Size fields to match the description (${reading.size ?? 'blank'})`,
      { type: 'trello.ringFields', args: { cardId: card.id, size: reading.size, status: FIELD_LABEL[reading.status] } })
  } else {
    const fields = await readRingSizeFields(card)
    reading = resolveRingSize({ fieldSize: fields.size, fieldStatus: fields.statusText, desc: card.desc })
  }

  if (reading.size === job.ringSize && reading.status === job.ringSizeStatus) return { action: 'unchanged' }

  const now = new Date()
  const confirmedNow = reading.status === 'confirmed' && job.ringSizeStatus !== 'confirmed'
  const releasesApproval = confirmedNow && job.status === 'approved_size_needed'
  const [updated] = await db.update(jobs).set({
    ringSize: reading.size,
    ringSizeStatus: reading.status,
    ...(reading.status === 'submitted' ? { ringSizeSubmittedAt: now } : {}),
    ...(reading.status === 'confirmed' ? { ringSizeConfirmedAt: now, ringSizeConfirmedBy: null } : {}),
    ...(releasesApproval ? { status: 'approved' as const } : {}),
    updatedAt: now,
  }).where(eq(jobs.id, job.id)).returning()

  // Confirmed on Trello: same effects as confirming in the Studio
  if (confirmedNow) {
    await answerWaiting(job.id, null)
    await stopFollowups(job.id, ['size'], 'Ring size confirmed on Trello')
  }
  let trello = null
  if (releasesApproval) {
    await tracked('trello_comment', job.id, 'Post the ring size confirmation comment', {
      type: 'trello.comment',
      args: { cardId: card.id, text: `**RING SIZE CONFIRMED: ${reading.size}** (on Trello)\n\nThe approved design can now go ahead: moving to Print Ready.` },
    })
    trello = moveOutcome(await tracked('trello_move', job.id, 'Move the approved card to Print Ready (size confirmed on Trello)',
      { type: 'trello.move', args: { cardId: card.id, stage: 'Print Ready' } }))
  }

  const from = { size: job.ringSize, status: job.ringSizeStatus }
  await logEvent(job.id, null, 'ring_size_synced', { from, to: reading, source: source.kind, releasesApproval, trello })
  const [designer] = job.designerId ? await db.select({ name: staff.name }).from(staff).where(eq(staff.id, job.designerId)) : []
  await emitWebhook(job.id, 'ring_size_changed', { ...jobPayload(updated, designer?.name ?? null), from, actor: { type: 'trello' } })
  return { action: 'updated', from, to: reading, releasesApproval }
}
