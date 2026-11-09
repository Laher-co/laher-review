import 'server-only'
import { alterationsPlan, findStageList, parseDesignerList, parseCardRef, type Stage } from './trello-parse'

// Labels and custom fields are found by name, so renaming colours or
// reordering them in Trello doesn't break anything.
export const LABEL_REVIEW_APP   = 'Review App'
export const LABEL_DO_NOT_EMAIL = 'Do not email'
export const LABEL_AWAITING_SIZE = 'Awaiting Finger Size'
export const FIELD_FINGER_SIZE        = 'Finger Size'
export const FIELD_FINGER_SIZE_STATUS = 'Finger Size Status'

// Set TRELLO_DRY_RUN=1 locally: reads hit Trello, writes are only logged.
const DRY_RUN = process.env.TRELLO_DRY_RUN === '1'

export interface TrelloLabel { id: string; name: string; color: string | null }
export interface TrelloList  { id: string; name: string }
export interface TrelloCustomField {
  id: string; name: string; type: string
  options?: { id: string; value: { text: string } }[]
}
export interface TrelloCard {
  id: string; name: string; desc: string; idList: string; idBoard: string
  shortUrl: string; shortLink?: string; labels: TrelloLabel[]
  customFieldItems?: { idCustomField: string; value?: { text?: string }; idValue?: string }[]
}

async function trello<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = process.env.TRELLO_API_KEY, token = process.env.TRELLO_TOKEN
  if (!key || !token) throw new Error('Trello credentials are not configured.')
  if (DRY_RUN && method !== 'GET') {
    console.log('[trello:dry-run]', method, path, body ? JSON.stringify(body) : '')
    return {} as T
  }
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(`https://api.trello.com/1${path}${sep}key=${key}&token=${token}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body:    body ? JSON.stringify(body) : undefined,
    cache:   'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Trello ${method} ${path.split('?')[0]} failed (${res.status}): ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

// ── Reads ─────────────────────────────────────────────────────────────────────

/** Accepts a card URL, short link or id. Returns null if it can't be found. */
export async function getCard(ref: string): Promise<TrelloCard | null> {
  const id = parseCardRef(ref)
  if (!id) return null
  try {
    return await trello<TrelloCard>('GET',
      `/cards/${id}?fields=name,desc,idList,idBoard,shortUrl,shortLink,labels&customFieldItems=true`)
  } catch (err) {
    if (err instanceof Error && /\((400|404)\)/.test(err.message)) return null
    throw err
  }
}

export const getList        = (id: string)      => trello<TrelloList>('GET', `/lists/${id}?fields=name`)

/** The app's own Trello user (LAHER Review App), so webhooks can ignore its own changes. */
let myMemberId: string | null = null
export async function getMyMemberId() {
  if (!myMemberId) myMemberId = (await trello<{ id: string }>('GET', '/members/me?fields=id')).id
  return myMemberId
}
export const getBoardLists  = (boardId: string) => trello<TrelloList[]>('GET', `/boards/${boardId}/lists?filter=open&fields=name`)
export const getBoardListsWithPos = (boardId: string) => trello<{ id: string; name: string; pos: number }[]>('GET', `/boards/${boardId}/lists?filter=open&fields=name,pos`)
export const getBoardLabels = (boardId: string) => trello<TrelloLabel[]>('GET', `/boards/${boardId}/labels?limit=1000`)
export const getBoardFields = (boardId: string) => trello<TrelloCustomField[]>('GET', `/boards/${boardId}/customFields`)
export const getListCards   = (listId: string)  => trello<TrelloCard[]>('GET', `/lists/${listId}/cards?fields=name,idList,idBoard,shortUrl,shortLink`)
export const getAttachments = (cardId: string)  => trello<{ id: string; name: string; url: string }[]>('GET', `/cards/${cardId}/attachments?fields=name,url`)

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

export function cardHasLabel(card: TrelloCard, name: string) {
  return card.labels.some(l => sameName(l.name, name))
}

/** Which designer funnel the card is in right now, if any. */
export async function cardFunnel(card: TrelloCard) {
  const list = await getList(card.idList)
  return { list, funnel: parseDesignerList(list.name) }
}

/**
 * When the card's finger size was last changed in each place: the
 * description's Finger Size section, and the Finger Size custom fields.
 */
export async function ringSizeChangeTimes(cardId: string) {
  const actions = await trello<{ type: string; date: string; data: { old?: { desc?: string }; card?: { desc?: string }; customField?: { name?: string } } }[]>(
    'GET', `/cards/${cardId}/actions?filter=updateCard:desc,updateCustomFieldItem&limit=100`)
  const { descriptionSection } = await import('./trello-parse')
  const section = (d?: string) => (descriptionSection(d ?? '', 'Finger Size') ?? '').trim()
  let descChangedAt: Date | null = null, fieldsChangedAt: Date | null = null
  for (const a of actions) { // newest first
    if (!descChangedAt && a.type === 'updateCard' && typeof a.data.old?.desc === 'string' && section(a.data.old.desc) !== section(a.data.card?.desc)) {
      descChangedAt = new Date(a.date)
    }
    if (!fieldsChangedAt && a.type === 'updateCustomFieldItem' && /^finger size/i.test(a.data.customField?.name ?? '')) {
      fieldsChangedAt = new Date(a.date)
    }
  }
  return { descChangedAt, fieldsChangedAt }
}

/** Reads the app's finger size custom fields, if they've been set. */
export async function readRingSizeFields(card: TrelloCard) {
  const fields = await getBoardFields(card.idBoard)
  const sizeField   = fields.find(f => sameName(f.name, FIELD_FINGER_SIZE))
  const statusField = fields.find(f => sameName(f.name, FIELD_FINGER_SIZE_STATUS))
  const items = card.customFieldItems ?? []
  const size = items.find(i => i.idCustomField === sizeField?.id)?.value?.text?.trim() || null
  const optionId = items.find(i => i.idCustomField === statusField?.id)?.idValue
  const statusText = statusField?.options?.find(o => o.id === optionId)?.value.text ?? null
  return { size, statusText }
}

// ── Writes ────────────────────────────────────────────────────────────────────

export type MoveResult =
  | { moved: true;  from: string; to: string }
  | { moved: false; reason: string; currentList: string }

/**
 * Moves the card to the given stage for the SAME designer whose funnel it's
 * in right now (read live, since staff may have dragged it). If the card isn't
 * in a designer funnel, or that designer has no list for the stage, it's left
 * where it is and the reason is returned so staff can be warned.
 */
export async function moveCardToStage(cardId: string, stage: Stage): Promise<MoveResult> {
  const card = await getCard(cardId)
  if (!card) return { moved: false, reason: 'Trello card not found', currentList: '' }
  const { list, funnel } = await cardFunnel(card)
  if (!funnel) {
    return { moved: false, reason: `Card isn't in a designer list ("${list.name}")`, currentList: list.name }
  }
  if (funnel.stage === stage) return { moved: true, from: list.name, to: list.name }
  const target = findStageList(await getBoardLists(card.idBoard), funnel.designer, stage)
  if (!target) {
    return { moved: false, reason: `No "${funnel.designer} | ${stage}" list found`, currentList: list.name }
  }
  await trello('PUT', `/cards/${card.id}`, { idList: target.id, pos: 'top' })
  return { moved: true, from: list.name, to: target.name }
}

export type AlterationsResult =
  | { moved: true; from: string; to: string }
  | { moved: false; skipped: string; currentList: string }

/**
 * Customer sent something: move the card to the Alterations list of the
 * designer funnel it's in now (read live). Only the list changes, never the
 * name. Throws if Trello errors or the designer has no Alterations list.
 */
export async function moveCardToAlterations(cardId: string): Promise<AlterationsResult> {
  const card = await getCard(cardId)
  if (!card) throw new Error('Trello card not found')
  const list = await getList(card.idList)
  const plan = alterationsPlan(card.labels.map(l => l.name), list.name, await getBoardLists(card.idBoard))
  if (plan.action === 'skip') return { moved: false, skipped: plan.reason, currentList: list.name }
  if (plan.action === 'no_list') throw new Error(`No “${plan.designer} | Alterations” list found`)
  await trello('PUT', `/cards/${card.id}`, { idList: plan.target.id, pos: 'top' })
  return { moved: true, from: list.name, to: plan.target.name }
}

/** Moves the card to a shared (non-designer) list found by name, e.g. REQUIRES SOURCING. Only the list changes. */
export async function moveCardToNamedList(cardId: string, listName: string): Promise<{ moved: true; from: string; to: string }> {
  const card = await getCard(cardId)
  if (!card) throw new Error('Trello card not found')
  const list = await getList(card.idList)
  if (sameName(list.name, listName)) return { moved: true, from: list.name, to: list.name }
  const target = (await getBoardLists(card.idBoard)).find(l => sameName(l.name, listName))
  if (!target) throw new Error(`No “${listName}” list found on the board`)
  await trello('PUT', `/cards/${card.id}`, { idList: target.id, pos: 'top' })
  return { moved: true, from: list.name, to: target.name }
}

/**
 * Has the card changed list since this moment? Read from the card's own
 * history, so it covers moves by staff, Zapier and the app alike.
 */
export async function cardMovedSince(cardId: string, since: Date) {
  const actions = await trello<{ date: string; data: { listAfter?: { name: string } }; memberCreator?: { fullName: string } }[]>(
    'GET', `/cards/${cardId}/actions?filter=updateCard:idList&since=${since.toISOString()}&limit=20&memberCreator_fields=fullName`)
  const latest = actions.find(a => a.data.listAfter) // newest first
  return latest ? { to: latest.data.listAfter!.name, when: new Date(latest.date), by: latest.memberCreator?.fullName ?? null } : null
}

/** Creates an open list on the board, unless one with exactly this name is already there. */
export async function ensureList(boardId: string, name: string, pos: number) {
  const existing = (await getBoardListsWithPos(boardId)).find(l => l.name === name)
  if (existing) return { id: existing.id, created: false }
  const list = await trello<{ id: string }>('POST', '/lists', { name, idBoard: boardId, pos })
  return { id: list.id, created: true }
}

/**
 * Adds a board label (by name) to the card if it isn't already there. With
 * createColor, a label missing from the board is created first.
 */
export async function ensureLabel(card: TrelloCard, name: string, createColor?: string) {
  if (cardHasLabel(card, name)) return
  let label = (await getBoardLabels(card.idBoard)).find(l => sameName(l.name, name))
  if (!label && createColor) label = await trello<TrelloLabel>('POST', `/boards/${card.idBoard}/labels`, { name, color: createColor })
  if (!label) throw new Error(`Trello label "${name}" doesn't exist on the board.`)
  await trello('POST', `/cards/${card.id}/idLabels`, { value: label.id })
}

export async function removeLabel(card: TrelloCard, name: string) {
  const label = card.labels.find(l => sameName(l.name, name))
  if (label) await trello('DELETE', `/cards/${card.id}/idLabels/${label.id}`)
}

export async function addComment(cardId: string, text: string) {
  await trello('POST', `/cards/${cardId}/actions/comments`, { text })
}

/** Attaches an image by URL so it shows as a thumbnail on the card. */
export async function attachUrl(cardId: string, url: string, name: string) {
  await trello('POST', `/cards/${cardId}/attachments`, { url, name, setCover: false })
}

/** Mirrors the app's ring size onto the card's custom fields. */
export async function writeRingSizeFields(
  card: TrelloCard, size: string | null, status: 'Unconfirmed' | 'Customer submitted' | 'Confirmed',
) {
  const fields = await getBoardFields(card.idBoard)
  const sizeField   = fields.find(f => sameName(f.name, FIELD_FINGER_SIZE))
  const statusField = fields.find(f => sameName(f.name, FIELD_FINGER_SIZE_STATUS))
  if (sizeField) {
    await trello('PUT', `/cards/${card.id}/customField/${sizeField.id}/item`,
      size ? { value: { text: size } } : { value: '' })
  }
  const option = statusField?.options?.find(o => sameName(o.value.text, status))
  if (statusField && option) {
    await trello('PUT', `/cards/${card.id}/customField/${statusField.id}/item`, { idValue: option.id })
  }
}
