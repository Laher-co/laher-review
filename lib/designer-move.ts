import 'server-only'
import { and, eq, sql } from 'drizzle-orm'
import { db, jobs, staff } from './db'
import { logEvent } from './events'
import { designerChange, parseDesignerList } from './trello-parse'

/**
 * Someone moved a card from one designer's lists to another's: the job's
 * designer follows (Studio and the customer page read it from the job), and a
 * note records who it moved from and to. Not an issue.
 */
export async function handleDesignerMove(cardId: string, listBefore: string, listAfter: string, movedBy: string | null) {
  const change = designerChange(listBefore, listAfter)
  const [job] = await db.select().from(jobs).where(eq(jobs.trelloCardId, cardId))
  if (!job) return 'no job'
  // A job created before a designer was assigned (onboarding): picks up the first designer's list it lands in
  if (!job.designerId && !change) {
    const into = parseDesignerList(listAfter)
    if (!into) return 'not a designer list'
    const [d] = await db.select().from(staff)
      .where(and(eq(staff.role, 'designer'), eq(staff.active, true), sql`lower(${staff.name}) = ${into.designer.toLowerCase()}`))
    if (!d) return `no Studio designer called ${into.designer}`
    await db.update(jobs).set({ designerId: d.id, updatedAt: new Date() }).where(eq(jobs.id, job.id))
    await logEvent(job.id, null, 'designer_assigned', { to: d.name, movedBy, listBefore, listAfter })
    return `designer assigned: ${d.name}`
  }
  if (!change) return 'same designer'
  const [to] = await db.select().from(staff)
    .where(and(eq(staff.role, 'designer'), eq(staff.active, true), sql`lower(${staff.name}) = ${change.to.toLowerCase()}`))
  if (to && to.id !== job.designerId) {
    await db.update(jobs).set({ designerId: to.id, updatedAt: new Date() }).where(eq(jobs.id, job.id))
  }
  await logEvent(job.id, null, 'designer_changed', {
    from: change.from, to: to?.name ?? change.to, movedBy, listBefore, listAfter,
    // No Studio designer by that name (e.g. not added yet): the note says so and the job keeps its designer
    updated: !!to,
  })
  return to ? `designer: ${change.from} → ${to.name}` : `no Studio designer called ${change.to}`
}
