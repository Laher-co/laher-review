// When a failed outside action is retried automatically. Pure, so it's unit tested.
import type { IssueOperation } from './db'

export const AUTO_RETRIES = 3
export const RETRY_GAP_MINUTES = 5

/** Moves are checked against the card's history before any retry. */
export const MOVE_OPERATIONS = new Set(['trello.move', 'trello.labelAndMove', 'trello.toAlterations'])

/** A Trello server error (5xx, e.g. a 503 outage), as opposed to a problem with the request. */
export function isTrelloOutage(op: IssueOperation | null | undefined, error: string) {
  return !!op?.type.startsWith('trello.') && /\bfailed \(5\d\d\)/.test(error)
}

/** After a failed automatic retry: try again later, or give up and show it in the Issues panel. */
export function afterFailedRetry(retriesDone: number, outage: boolean, now = new Date()) {
  return outage && retriesDone < AUTO_RETRIES
    ? { status: 'retrying' as const, nextRetryAt: new Date(now.getTime() + RETRY_GAP_MINUTES * 60_000) }
    : { status: 'open' as const, nextRetryAt: null }
}
