import 'server-only'
import { eq } from 'drizzle-orm'
import { db, jobs } from './db'
import { logEvent } from './events'
import { tracked } from './issues'
import { getCard } from './trello'
import { hasLabel, LABEL_CONCEPT, LABEL_OLD_SYSTEM, LABEL_SIDE_STONES } from './stone'

/** The two job switches that mirror a Trello label (Stone not secured has its own, with auto-detection). */
export const FLAGS = {
  side_stones: { column: 'sideStonesUnconfirmed', label: LABEL_SIDE_STONES, labelColor: 'yellow', name: 'Side stones not confirmed' },
  concept:     { column: 'conceptRender',         label: LABEL_CONCEPT,     labelColor: 'purple', name: 'Concept render' },
} as const
export type FlagKey = keyof typeof FLAGS
type Job = typeof jobs.$inferSelect

/** Switches a flag on or off; the label follows unless the change came from the label itself. */
export async function setFlag(job: Pick<Job, 'id' | 'trelloCardId'>, key: FlagKey, on: boolean, o: { staffId?: string | null; source: 'studio' | 'publish' | 'trello' | 'released' }) {
  const f = FLAGS[key]
  await db.update(jobs).set({ [f.column]: on, updatedAt: new Date() }).where(eq(jobs.id, job.id))
  if (o.source !== 'trello') {
    await tracked('trello_label', job.id, `${on ? 'Add' : 'Remove'} the “${f.label}” label`, {
      type: on ? 'trello.addLabel' : 'trello.removeLabel',
      args: { cardId: job.trelloCardId, name: f.label, ...(on ? { createColor: f.labelColor } : {}) },
    })
  }
  await logEvent(job.id, o.staffId ?? null, `${key}_${on ? 'on' : 'off'}`, { source: o.source })
}

/** The label was added or removed in Trello: the switch follows (read live). */
export async function syncFlagFromLabel(cardId: string, key: FlagKey) {
  const [job] = await db.select().from(jobs).where(eq(jobs.trelloCardId, cardId))
  if (!job) return 'no job'
  const card = await getCard(cardId)
  if (!card) throw new Error('Trello card not found')
  if (hasLabel(card.labels, LABEL_OLD_SYSTEM)) return 'old system'
  const on = hasLabel(card.labels, FLAGS[key].label)
  if (on === job[FLAGS[key].column]) return 'unchanged'
  await setFlag(job, key, on, { source: 'trello' })
  return on ? 'on' : 'off'
}

/**
 * A held approval is done: side stones confirmed (card moved to Print Ready by
 * a person), or the full design published. The customer banner goes back to
 * the normal flow. No customer email.
 */
export async function releaseHold(job: Job, reason: 'side_stones_confirmed' | 'new_version' | 'sourcing_print_ready') {
  if (!job.approvedHold) return
  await db.update(jobs).set({ approvedHold: null, updatedAt: new Date(), ...(reason !== 'new_version' && job.status !== 'approved_size_needed' ? { status: 'approved' as const } : {}) })
    .where(eq(jobs.id, job.id))
  if (job.approvedHold === 'side_stones' && job.sideStonesUnconfirmed && reason !== 'new_version') {
    await setFlag(job, 'side_stones', false, { source: 'released' })
  }
  await logEvent(job.id, null, 'hold_released', { hold: job.approvedHold, reason })
}
