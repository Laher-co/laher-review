import 'server-only'
import { unstable_cache } from 'next/cache'
import { getBoardCardDues, getBoardLists, getCard, getCardComments, getList, type TrelloCard } from './trello'
import { ORDER_BOARD_ID } from './studio-links'
import { castingState, dateMismatch, sydneyDate, type CastingState } from './casting'

const todaySydney = () => sydneyDate(new Date())

/** Studio job page: the card as just read, plus a date-mismatch check of its description and comments. */
export async function castingForCard(card: TrelloCard | null): Promise<{ state: CastingState; mismatch: string | null } | null> {
  if (!card?.due) return null
  try {
    const list = await getList(card.idList)
    const state = castingState({ due: card.due, listName: list.name }, todaySydney())
    if (!state) return null
    const comments = await getCardComments(card.id).catch(() => [] as string[])
    return { state, mismatch: dateMismatch([card.desc, ...comments], state.due) }
  } catch {
    return null
  }
}

/** Every card's due date and list, read once for the job list (cached for 2 minutes). */
const boardDues = unstable_cache(async () => {
  const [cards, lists] = await Promise.all([getBoardCardDues(ORDER_BOARD_ID), getBoardLists(ORDER_BOARD_ID)])
  const listName = new Map(lists.map(l => [l.id, l.name]))
  return Object.fromEntries(cards.filter(c => c.due).map(c => [c.id, { due: c.due!, listName: listName.get(c.idList) ?? '' }]))
}, ['casting-board-dues'], { revalidate: 120 })

/** Job list badges: card id → alert. Empty if Trello can't be reached. */
export async function castingForBoard(): Promise<Record<string, CastingState>> {
  try {
    const dues = await boardDues()
    const today = todaySydney()
    const out: Record<string, CastingState> = {}
    for (const [id, c] of Object.entries(dues)) { const s = castingState(c, today); if (s) out[id] = s }
    return out
  } catch {
    return {}
  }
}

/** Customer page: the card's due date and list (cached for 2 minutes per card). */
const cardDue = unstable_cache(async (cardId: string) => {
  const card = await getCard(cardId)
  if (!card?.due) return null
  return { due: card.due, listName: (await getList(card.idList)).name }
}, ['casting-card-due'], { revalidate: 120 })

export async function castingForCustomer(cardId: string): Promise<CastingState | null> {
  try {
    const c = await cardDue(cardId)
    return c ? castingState(c, todaySydney()) : null
  } catch {
    return null
  }
}
