import 'server-only'
import { db, events, webhookEvents } from './db'
import { tracked } from './issues'

export async function logEvent(
  jobId: string | null, staffId: string | null, type: string, details: Record<string, unknown> = {},
) {
  await db.insert(events).values({ jobId, staffId, type, details })
}

/**
 * Sends a v2 event to Zapier (ZAPIER_EVENTS_WEBHOOK_URL). Every event is
 * stored first; a failed delivery becomes an issue with a Retry button.
 * Never throws: a Zapier outage mustn't block publishing or a customer's
 * submission.
 */
export async function emitWebhook(jobId: string | null, type: string, payload: Record<string, unknown>) {
  const body = { schemaVersion: 2, event: type, occurredAt: new Date().toISOString(), ...payload }
  const configured = !!process.env.ZAPIER_EVENTS_WEBHOOK_URL
  const [row] = await db.insert(webhookEvents)
    .values({ jobId, type, payload: body, status: configured ? 'pending' : 'skipped' })
    .returning({ id: webhookEvents.id })
  if (!configured) return
  await tracked('webhook', jobId, `Send “${type}” to Zapier`, { type: 'webhook.send', args: { webhookEventId: row.id } })
}
