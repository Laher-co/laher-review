import 'server-only'
import { and, gte, isNotNull, lt } from 'drizzle-orm'
import { db, waiting } from './db'
import { weekStart } from './working-hours'
import { OVERDUE_WORKING_MINUTES } from './alerts'

/** Average response (working minutes) and overdue count for items answered in [from, to). */
async function stats(from: Date, to: Date) {
  const rows = await db.select({ minutes: waiting.workingMinutes, overdueAt: waiting.overdueAlertSentAt })
    .from(waiting)
    .where(and(isNotNull(waiting.answeredAt), gte(waiting.answeredAt, from), lt(waiting.answeredAt, to)))
  const timed = rows.filter(r => r.minutes !== null).map(r => r.minutes!)
  return {
    answered: rows.length,
    averageMinutes: timed.length ? Math.round(timed.reduce((a, b) => a + b, 0) / timed.length) : null,
    overdue: rows.filter(r => r.overdueAt || (r.minutes ?? 0) > OVERDUE_WORKING_MINUTES).length,
  }
}

export async function weeklyKpis(now = new Date()) {
  const thisWeek = weekStart(now)
  const lastWeek = new Date(thisWeek.getTime() - 7 * 86_400_000)
  return { thisWeek: await stats(thisWeek, now), lastWeek: await stats(lastWeek, thisWeek) }
}
