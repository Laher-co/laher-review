import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db, followups, jobs, staff } from './db'
import { logEvent } from './events'
import { recordIssue, tracked } from './issues'
import { getCard, type TrelloCard } from './trello'
import { releaseHold } from './job-flags'
import { parseDesignerList } from './trello-parse'
import {
  gemstoneDetails, hasCaratTbc, hasLabel, isSourcingList, LABEL_DESIGN_APPROVED, LABEL_OLD_SYSTEM, LABEL_STONE, sourcingExit,
} from './stone'

type Job = typeof jobs.$inferSelect
type Source = 'studio' | 'auto' | 'trello' | 'sourcing'

/**
 * Switches "Stone not secured" on or off. The STONE NEEDS SOURCING label
 * follows it (unless the change came from the label itself). Remembering the
 * gemstone details means a switch-off sticks until those details change.
 */
export async function setStone(job: Pick<Job, 'id' | 'trelloCardId'>, on: boolean, o: { staffId?: string | null; source: Source; detailsSeen?: string | null }) {
  await db.update(jobs).set({
    stoneNotSecured: on, updatedAt: new Date(),
    ...(o.detailsSeen !== undefined ? { stoneDetailsSeen: o.detailsSeen } : {}),
  }).where(eq(jobs.id, job.id))
  if (o.source !== 'trello') {
    await tracked('trello_label', job.id, `${on ? 'Add' : 'Remove'} the “${LABEL_STONE}” label`,
      { type: on ? 'trello.addLabel' : 'trello.removeLabel', args: { cardId: job.trelloCardId, name: LABEL_STONE } })
  }
  await logEvent(job.id, o.staffId ?? null, on ? 'stone_not_secured_on' : 'stone_not_secured_off', { source: o.source })
}

/** Description edited: switch on if the gemstone details now say "ct TBC" (only when those details changed). */
export async function detectStone(job: Job, card: TrelloCard) {
  if (hasLabel(card.labels, LABEL_OLD_SYSTEM)) return 'old system'
  const details = gemstoneDetails(card.desc)
  if (details === job.stoneDetailsSeen) return 'gemstone details unchanged'
  if (hasCaratTbc(details) && !job.stoneNotSecured) {
    await setStone(job, true, { source: 'auto', detailsSeen: details })
    return 'switched on (ct TBC)'
  }
  await db.update(jobs).set({ stoneDetailsSeen: details }).where(eq(jobs.id, job.id))
  return 'checked'
}

/** The STONE NEEDS SOURCING label was added or removed in Trello: the switch follows (read live). */
export async function syncStoneFromLabel(cardId: string) {
  const [job] = await db.select().from(jobs).where(eq(jobs.trelloCardId, cardId))
  if (!job) return 'no job'
  const card = await getCard(cardId)
  if (!card) throw new Error('Trello card not found')
  if (hasLabel(card.labels, LABEL_OLD_SYSTEM)) return 'old system'
  const on = hasLabel(card.labels, LABEL_STONE)
  if (on === job.stoneNotSecured) return 'unchanged'
  await setStone(job, on, { source: 'trello', detailsSeen: gemstoneDetails(card.desc) })
  return on ? 'on' : 'off'
}

/** Reminders pick up where they left off: their clock moves on by the time spent in REQUIRES SOURCING. */
async function resumeFollowups(job: Job) {
  if (!job.sourcingSince) return
  const pausedMs = Date.now() - job.sourcingSince.getTime()
  await db.update(followups)
    .set({ startedAt: sql`${followups.startedAt} + ${`${Math.round(pausedMs / 1000)} seconds`}::interval` })
    .where(and(eq(followups.jobId, job.id), eq(followups.status, 'active')))
}

/** Approved while the stone isn't secured: the app moved the card to REQUIRES SOURCING. */
export async function enterSourcing(jobId: string, kind: 'approved' | 'new_stone', designer: string | null, by: 'app' | 'person') {
  await db.update(jobs).set({ sourcing: kind, sourcingSince: new Date(), sourcingDesigner: designer, updatedAt: new Date() })
    .where(eq(jobs.id, jobId))
  await logEvent(jobId, null, 'sourcing_in', { kind, designer, by })
}

/**
 * A person moved a card into or out of REQUIRES SOURCING (from the Trello
 * webhook; the app's own moves are handled where they happen).
 */
export async function handleSourcingMove(cardId: string, listBefore: string, listAfter: string) {
  const into = isSourcingList(listAfter) && !isSourcingList(listBefore)
  const outOf = isSourcingList(listBefore) && !isSourcingList(listAfter)
  if (!into && !outOf) return 'not a sourcing move'
  const [row] = await db.select({ job: jobs, designer: staff.name })
    .from(jobs).leftJoin(staff, eq(staff.id, jobs.designerId)).where(eq(jobs.trelloCardId, cardId))
  if (!row) return 'no job'
  const { job } = row
  const card = await getCard(cardId)
  if (!card) throw new Error('Trello card not found')
  if (hasLabel(card.labels, LABEL_OLD_SYSTEM)) return 'old system'

  if (into) {
    const designer = parseDesignerList(listBefore)?.designer ?? row.designer
    const approved = hasLabel(card.labels, LABEL_DESIGN_APPROVED)
    if (!approved) {
      await tracked('trello_comment', job.id, 'Post “NEW STONE NEEDED” on the Trello card', {
        type: 'trello.comment',
        args: { cardId, text: `**NEW STONE NEEDED** – return to ${designer ?? 'the designer'} | Alterations once sourced for new renders.` },
      })
    }
    await enterSourcing(job.id, approved ? 'approved' : 'new_stone', designer, 'person')
    return approved ? 'in: approved' : 'in: new stone'
  }

  // Out of REQUIRES SOURCING
  const designer = job.sourcingDesigner ?? row.designer
  const exit = sourcingExit(listAfter, designer)
  if (typeof exit === 'object') {
    await recordIssue({
      kind: 'trello_webhook', jobId: job.id, operation: null, error: exit.issue,
      summary: `Card moved out of REQUIRES SOURCING ${exit.issue}. The job wasn’t changed: please check it`,
    })
    return `issue: ${exit.issue}`
  }
  await resumeFollowups(job)
  // An approval still held for the concept build or side stones goes back to
  // Alterations as approved (not as new changes): the hold drives the banner
  const heldApproval = exit === 'alterations' && !!job.approvedHold && job.sourcing === 'approved'
  const backToChanges = exit === 'alterations' && !heldApproval
  await db.update(jobs).set({
    sourcing: null, sourcingSince: null, updatedAt: new Date(),
    status: backToChanges ? 'changes_requested' : job.status === 'approved_size_needed' ? 'approved_size_needed' : 'approved',
  }).where(eq(jobs.id, job.id))
  if (job.stoneNotSecured) await setStone(job, false, { source: 'sourcing', detailsSeen: gemstoneDetails(card.desc) })
  if (backToChanges) {
    await tracked('trello_label', job.id, `Remove the “${LABEL_DESIGN_APPROVED}” label`,
      { type: 'trello.removeLabel', args: { cardId, name: LABEL_DESIGN_APPROVED } })
  }
  // Straight to Print Ready: side stones are taken as confirmed too
  if (exit === 'print_ready' && job.approvedHold === 'side_stones') await releaseHold(job, 'sourcing_print_ready')
  // The customer page reads this: approved ("going into production") or back to alterations
  await logEvent(job.id, null, 'sourcing_released', { stage: backToChanges ? 'alterations' : 'approved', listAfter, heldApproval })
  return `out: ${exit}${heldApproval ? ` (still held: ${job.approvedHold})` : ''}`
}
