import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { db, waiting } from './db'

/**
 * Starts the job's response timer if one isn't already running. Messages,
 * decisions and ring size submissions all feed this one queue; the staff
 * page, alerts and overdue checks (Phase 3) read from it.
 */
export async function openWaiting(jobId: string, reason: 'message' | 'decision' | 'ring_size') {
  const [open] = await db.select({ id: waiting.id }).from(waiting)
    .where(and(eq(waiting.jobId, jobId), isNull(waiting.answeredAt)))
  if (!open) await db.insert(waiting).values({ jobId, reason })
}
