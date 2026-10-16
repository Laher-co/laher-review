import 'server-only'
import { eq } from 'drizzle-orm'
import { db, jobs } from './db'
import { logEvent } from './events'
import { cardHasLabel, getCard, LABEL_DO_NOT_EMAIL } from './trello'

/**
 * A "Do not email" label was added or removed in Trello: mirror the card's
 * label as it is now on the job (read live, so out-of-order events can't
 * leave the switch wrong).
 */
export async function syncDoNotEmail(cardId: string) {
  const [job] = await db.select({ id: jobs.id, doNotEmail: jobs.doNotEmail }).from(jobs).where(eq(jobs.trelloCardId, cardId))
  if (!job) return 'no job'
  const card = await getCard(cardId)
  if (!card) throw new Error('Trello card not found')
  const on = cardHasLabel(card, LABEL_DO_NOT_EMAIL)
  if (job.doNotEmail === on) return 'unchanged'
  await db.update(jobs).set({ doNotEmail: on, updatedAt: new Date() }).where(eq(jobs.id, job.id))
  await logEvent(job.id, null, on ? 'do_not_email_on' : 'do_not_email_off', { source: 'trello' })
  return on ? 'on' : 'off'
}
