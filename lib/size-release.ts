import 'server-only'
import type { jobs } from './db'
import { moveOutcome, tracked } from './issues'
import { sizeReleasesToPrintReady } from './approval'

type Job = typeof jobs.$inferSelect

/** Moves the card to Print Ready if the size was all the approval was waiting on (see sizeReleasesToPrintReady). */
export async function moveToPrintReadyForSize(job: Job, by: string) {
  if (!sizeReleasesToPrintReady(job)) return null
  return moveOutcome(await tracked('trello_move', job.id, `Move the approved card to Print Ready (finger size entered by ${by})`,
    { type: 'trello.move', args: { cardId: job.trelloCardId, stage: 'Print Ready' } }))
}
