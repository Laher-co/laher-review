import 'server-only'
import { logEvent } from './events'
import { tracked } from './issues'
import type { AlterationsResult } from './trello'

/**
 * A customer message, change request or drawing in the portal moves the card
 * from Revision to Alterations in its designer funnel (other lists: no move).
 * Email replies and ring sizes never move it.
 * Never throws: a Trello error becomes an issue with an alert email to the
 * team, and the customer's message is already saved. Every outcome is logged.
 */
export async function moveToAlterationsForCustomer(job: { id: string; trelloCardId: string }, trigger: string) {
  try {
    const t = await tracked<AlterationsResult>('trello_move', job.id, `Move the card to Alterations (${trigger})`,
      { type: 'trello.toAlterations', args: { cardId: job.trelloCardId } })
    if (t.ok) {
      const r = t.value
      await logEvent(job.id, null, r.moved ? 'trello_card_moved' : 'trello_move_skipped', { ...r, stage: 'Alterations', trigger })
      console.log(`[trello] ${trigger}: ${r.moved ? `moved “${r.from}” → “${r.to}”` : `not moved (${r.skipped})`}`)
      return r.moved
        ? { moved: true as const, from: r.from, to: r.to }
        : { moved: false as const, skipped: true as const, reason: r.skipped, currentList: r.currentList }
    }
    await logEvent(job.id, null, 'trello_move_failed', { stage: 'Alterations', trigger, error: t.error, issueId: t.issueId })
    return { moved: false as const, reason: t.error, currentList: '', issueId: t.issueId, retrying: t.retrying }
  } catch (err) {
    console.error('[trello] move to Alterations failed to log', err)
    return { moved: false as const, reason: 'Couldn’t move the card', currentList: '' }
  }
}
