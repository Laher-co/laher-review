import 'server-only'
import { eq } from 'drizzle-orm'
import { db, jobs, options, staff, versions } from './db'
import { logEvent } from './events'
import { tracked } from './issues'
import { newPublicCode } from './jobs'
import { cardFunnel, cardHasLabel, LABEL_DO_NOT_EMAIL, readRingSizeFields, ringSizeChangeTimes, type TrelloCard } from './trello'
import { descriptionSection, extractEmail } from './trello-parse'
import { resolveLatestRingSize, type RingStatus } from './ring-size'

export type CardPreview = {
  cardId: string
  cardUrl: string
  cardName: string
  listName: string
  customerName: string
  customerEmail: string
  designer: string | null
  designerId: string | null
  ringSize: string | null          // the size, or the hint when unconfirmed ("M (tbc)" → "M")
  ringSizeStatus: RingStatus
  doNotEmail: boolean
  existingJobId: string | null
}

/** Everything a job needs, read from the card as it is right now. */
export async function cardDetails(card: TrelloCard): Promise<CardPreview> {
  const [{ list, funnel }, fields, [existing], designers, changed] = await Promise.all([
    cardFunnel(card),
    readRingSizeFields(card),
    db.select({ id: jobs.id }).from(jobs).where(eq(jobs.trelloCardId, card.id)),
    db.select().from(staff).where(eq(staff.active, true)),
    ringSizeChangeTimes(card.id),
  ])

  // Ring size: whichever was changed most recently on the card (description or
  // the Finger Size fields). "tbc" anywhere = unconfirmed
  const ring = resolveLatestRingSize({ fieldSize: fields.size, fieldStatus: fields.statusText, desc: card.desc, ...changed })

  const designer = funnel?.designer ?? null
  const designerRow = designer ? designers.find(d => d.name.toLowerCase() === designer.toLowerCase()) : undefined

  return {
    cardId:        card.id,
    cardUrl:       card.shortUrl,
    cardName:      card.name,
    listName:      list.name,
    customerName:  descriptionSection(card.desc, 'Name') ?? '',
    customerEmail: extractEmail(card.name, descriptionSection(card.desc, 'Contact Details'), card.desc) ?? '',
    designer,
    designerId:    designerRow?.id ?? null,
    ringSize:      ring.size,
    ringSizeStatus: ring.status,
    doNotEmail:    cardHasLabel(card, LABEL_DO_NOT_EMAIL),
    existingJobId: existing?.id ?? null,
  }
}

/**
 * Creates the job (with Version One / Option A ready for uploads) and mirrors
 * the ring size onto the card. Safe if two people click at once: the second
 * gets the job the first created.
 */
export async function createJobFromDetails(d: CardPreview, input: {
  customerName: string; customerEmail: string; designerId: string | null; createdBy: string; via: 'new_job_form' | 'trello_link'
}): Promise<string> {
  const [job] = await db.insert(jobs).values({
    publicCode:     newPublicCode(),
    trelloCardId:   d.cardId,
    trelloShortUrl: d.cardUrl,
    title:          d.cardName,
    customerName:   input.customerName,
    customerEmail:  input.customerEmail,
    designerId:     input.designerId,
    ringSize:       d.ringSize,
    ringSizeStatus: d.ringSizeStatus,
    createdBy:      input.createdBy,
  }).onConflictDoNothing({ target: jobs.trelloCardId }).returning()
  if (!job) {
    const [existing] = await db.select({ id: jobs.id }).from(jobs).where(eq(jobs.trelloCardId, d.cardId))
    return existing.id
  }

  const [v] = await db.insert(versions).values({ jobId: job.id, number: 1 }).returning()
  await db.insert(options).values({ versionId: v.id, label: 'A', sort: 0 })

  await tracked('trello_fields', job.id, 'Set the Finger Size fields on the Trello card', {
    type: 'trello.ringFields',
    args: { cardId: d.cardId, size: d.ringSize, status: FIELD_LABEL[d.ringSizeStatus] },
  })
  await logEvent(job.id, input.createdBy, 'job_created', { trelloCardId: d.cardId, via: input.via })
  return job.id
}

export const FIELD_LABEL = { unconfirmed: 'Unconfirmed', submitted: 'Customer submitted', confirmed: 'Confirmed' } as const
