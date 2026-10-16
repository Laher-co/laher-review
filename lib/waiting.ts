import 'server-only'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db, messages, waiting } from './db'
import { workingMinutesBetween } from './working-hours'

/**
 * Starts the job's response timer if one isn't already running. Messages,
 * decisions and ring size submissions all feed this one queue; the staff
 * queue, alerts and OVERDUE checks read from it.
 */
export async function openWaiting(jobId: string, reason: 'message' | 'decision' | 'ring_size', since = new Date()) {
  const [open] = await db.select({ id: waiting.id }).from(waiting)
    .where(and(eq(waiting.jobId, jobId), isNull(waiting.answeredAt)))
  if (open) return { id: open.id, created: false }
  const [row] = await db.insert(waiting).values({ jobId, reason, waitingSince: since }).returning({ id: waiting.id })
  return { id: row.id, created: true }
}

/** Stops the timer, recording the response time in working minutes (for the KPIs). */
async function closeOpen(jobId: string, staffId: string | null) {
  const now = new Date()
  const open = await db.select().from(waiting).where(and(eq(waiting.jobId, jobId), isNull(waiting.answeredAt)))
  for (const w of open) {
    await db.update(waiting)
      .set({ answeredAt: now, answeredBy: staffId, workingMinutes: workingMinutesBetween(w.waitingSince, now) })
      .where(eq(waiting.id, w.id))
  }
  return open.length > 0
}

/**
 * Staff answered the job (reply, new version published, ring size confirmed).
 * If another thread still ends with a customer message nobody has replied to,
 * the timer keeps running from that message, so a reply in one thread can't
 * hide a question in another.
 */
export async function answerWaiting(jobId: string, staffId: string | null) {
  await closeOpen(jobId, staffId)

  const rows = await db.select({ versionId: messages.versionId, author: messages.author, createdAt: messages.createdAt })
    .from(messages).where(eq(messages.jobId, jobId)).orderBy(asc(messages.createdAt))
  const unanswered = new Map<string, Date>()
  for (const m of rows) {
    const key = m.versionId ?? 'general'
    if (m.author === 'staff') unanswered.delete(key)
    else if (!unanswered.has(key)) unanswered.set(key, m.createdAt)
  }
  if (unanswered.size > 0) {
    const earliest = new Date(Math.min(...[...unanswered.values()].map(d => d.getTime())))
    const r = await openWaiting(jobId, 'message', earliest)
    // Already alerted when that message arrived
    await db.update(waiting).set({ alertSentAt: new Date() }).where(eq(waiting.id, r.id))
  }
}

/** "Mark handled": the customer doesn't need a reply (e.g. an approval). */
export async function markHandled(jobId: string, staffId: string) {
  return closeOpen(jobId, staffId)
}
