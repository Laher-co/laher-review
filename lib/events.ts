import 'server-only'
import { eq } from 'drizzle-orm'
import { db, events, webhookEvents } from './db'

export async function logEvent(
  jobId: string | null, staffId: string | null, type: string, details: Record<string, unknown> = {},
) {
  await db.insert(events).values({ jobId, staffId, type, details })
}

/**
 * Sends a v2 event to Zapier (ZAPIER_EVENTS_WEBHOOK_URL). Every event is
 * stored first, so a failed delivery can be retried and nothing is lost.
 * Never throws: a Zapier outage mustn't block publishing or a customer's
 * submission.
 */
export async function emitWebhook(jobId: string | null, type: string, payload: Record<string, unknown>) {
  const body = { schemaVersion: 2, event: type, occurredAt: new Date().toISOString(), ...payload }
  const url = process.env.ZAPIER_EVENTS_WEBHOOK_URL
  const [row] = await db.insert(webhookEvents)
    .values({ jobId, type, payload: body, status: url ? 'pending' : 'skipped' })
    .returning({ id: webhookEvents.id })
  if (!url) return

  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
    })
    await db.update(webhookEvents)
      .set({ status: res.ok ? 'sent' : 'failed', attempts: 1, lastError: res.ok ? null : `HTTP ${res.status}` })
      .where(eq(webhookEvents.id, row.id))
  } catch (err) {
    await db.update(webhookEvents)
      .set({ status: 'failed', attempts: 1, lastError: err instanceof Error ? err.message : String(err) })
      .where(eq(webhookEvents.id, row.id))
  }
}
