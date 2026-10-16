import 'server-only'
import { and, eq } from 'drizzle-orm'
import { db, staff } from './db'
import { tracked } from './issues'
import { findStageList, isEmailOnlyName, parseDesignerList } from './trello-parse'
import { getAttachments, getBoardLists, getCard, getList, getListCards } from './trello'

export const STUDIO_LINK_NAME = 'Open in LAHER Studio'
export const ORDER_BOARD_ID = '6298669bf6dbcc7f66baa38d' // Laher // Order Management

/** The permanent Studio address for a card (always the live site, since Trello keeps it). */
export function studioCardUrl(shortLink: string) {
  const base = (process.env.APP_URL ?? 'https://review.laher.co').replace(/\/$/, '')
  return `${base}/studio/cards/${shortLink}`
}

async function enabledDesigners() {
  const rows = await db.select({ name: staff.name }).from(staff)
    .where(and(eq(staff.role, 'designer'), eq(staff.onStudio, true), eq(staff.active, true)))
  return new Set(rows.map(r => r.name.toLowerCase()))
}

export type LinkResult =
  | { action: 'added' | 'already_linked' }
  | { action: 'skipped'; reason: string }
  | { action: 'failed'; error: string }

/**
 * Adds the "Open in LAHER Studio" link if — right now, read live from Trello —
 * the card is in an enabled designer's New Design Renders list and its whole
 * name is one email address. Never adds a second link.
 */
export async function ensureStudioLink(cardId: string, designersOn?: Set<string>): Promise<LinkResult> {
  const card = await getCard(cardId)
  if (!card) return { action: 'skipped', reason: 'card not found' }
  if (card.idBoard !== ORDER_BOARD_ID) return { action: 'skipped', reason: 'not on Order Management' }
  if (!isEmailOnlyName(card.name)) return { action: 'skipped', reason: 'name is not just an email' }

  const funnel = parseDesignerList((await getList(card.idList)).name)
  if (!funnel || funnel.stage !== 'New Design Renders') return { action: 'skipped', reason: 'not in a New Design Renders list' }
  const on = designersOn ?? await enabledDesigners()
  if (!on.has(funnel.designer.toLowerCase())) return { action: 'skipped', reason: `${funnel.designer} isn’t on LAHER Studio yet` }

  const shortLink = card.shortLink ?? card.shortUrl.split('/').pop()!
  const url = studioCardUrl(shortLink)
  const existing = await getAttachments(card.id)
  if (existing.some(a => a.url === url || a.name === STUDIO_LINK_NAME)) return { action: 'already_linked' }

  const r = await tracked('trello_attachment', null, `Add “${STUDIO_LINK_NAME}” to ${card.name}`,
    { type: 'trello.attach', args: { cardId: card.id, url, name: STUDIO_LINK_NAME } })
  return r.ok ? { action: 'added' } : { action: 'failed', error: r.error }
}

/**
 * Backfill for one designer: only cards currently in their New Design Renders
 * list. Revision and Alterations stay on the old system.
 */
export async function backfillDesigner(designer: string) {
  const lists = await getBoardLists(ORDER_BOARD_ID)
  const list = findStageList(lists, designer, 'New Design Renders')
  if (!list) return { list: null, results: [] as { card: string; result: LinkResult }[] }
  const on = new Set([designer.toLowerCase()])
  const cards = await getListCards(list.id)
  const results = []
  for (const c of cards) results.push({ card: c.name, result: await ensureStudioLink(c.id, on) })
  return { list: list.name, results }
}
