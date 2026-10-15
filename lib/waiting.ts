import 'server-only'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db, messages, waiting } from './db'

/**
 * Starts the job's response timer if one isn't already running. Messages,
 * decisions and ring size submissions all feed this one queue; the staff
 * page, alerts and overdue checks read from it.
 */
export async function openWaiting(jobId: string, reason: 'message' | 'decision' | 'ring_size', since = new Date()) {
  const [open] = await db.select({ id: waiting.id }).from(waiting)
    .where(and(eq(waiting.jobId, jobId), isNull(waiting.answeredAt)))
  if (!open) await db.insert(waiting).values({ jobId, reason, waitingSince: since })
}

/**
 * Staff answered the job. If another thread still ends with a customer
 * message nobody has replied to, the timer keeps running from that message,
 * so a reply in one thread can't hide a question in another.
 */
export async function answerWaiting(jobId: string, staffId: string) {
  await db.update(waiting).set({ answeredAt: new Date(), answeredBy: staffId })
    .where(and(eq(waiting.jobId, jobId), isNull(waiting.answeredAt)))

  const rows = await db.select({ versionId: messages.versionId, author: messages.author, createdAt: messages.createdAt })
    .from(messages).where(eq(messages.jobId, jobId)).orderBy(asc(messages.createdAt))
  // Per thread: the first customer message after the last staff message
  const unanswered = new Map<string, Date>()
  for (const m of rows) {
    const key = m.versionId ?? 'general'
    if (m.author === 'staff') unanswered.delete(key)
    else if (!unanswered.has(key)) unanswered.set(key, m.createdAt)
  }
  if (unanswered.size > 0) {
    const earliest = new Date(Math.min(...[...unanswered.values()].map(d => d.getTime())))
    await openWaiting(jobId, 'message', earliest)
  }
}
