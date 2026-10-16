// Ring size rules, shared by job creation, the Trello sync and the pages.
// Pure functions (no database or Trello calls) so every case is unit tested.
import { descriptionSection } from './trello-parse'

export type RingStatus = 'unconfirmed' | 'submitted' | 'confirmed'

/**
 * Reads a finger size as written on a card. "tbc" anywhere (any case) means
 * UNCONFIRMED; whatever else is written is kept as a hint, e.g.
 *   "M (tbc)" → unconfirmed, hint "M"      "tbc - around M" → hint "around M"
 *   "N TBC"   → unconfirmed, hint "N"      "TBC" → unconfirmed, no hint
 * Only a size with no "tbc" in it counts as confirmed. Blank → unconfirmed.
 */
export function readSizeText(text: string | null | undefined): { size: string | null; status: 'unconfirmed' | 'confirmed' } {
  const raw = (text ?? '').split('\n').map(l => l.trim()).filter(Boolean).join(' ').trim()
  if (!raw || /^(n\/?a|none|unknown|-+)$/i.test(raw)) return { size: null, status: 'unconfirmed' }
  if (!/tbc/i.test(raw)) return { size: raw.slice(0, 40), status: 'confirmed' }
  const hint = raw
    .replace(/tbc/gi, ' ')
    .replace(/\bFS\b/g, ' ')                      // "K 1/2 (FS TBC)" → finger size note
    .replace(/\(\s*[-–:,]*\s*\)/g, ' ')          // emptied brackets
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\((.*)\)$/, '$1')                 // "(5-6US)" → "5-6US"
    .replace(/^[\s\-–:,/?]+|[\s\-–:,/?(]+$/g, '') // stray separators at the ends
    .trim()
  return { size: hint ? hint.slice(0, 40) : null, status: 'unconfirmed' }
}

/** The finger size from a card description's "Finger Size:" section. */
export function sizeFromDescription(desc: string) {
  return readSizeText(descriptionSection(desc, 'Finger Size'))
}

const FIELD_STATUS: Record<string, RingStatus> = {
  unconfirmed: 'unconfirmed', 'customer submitted': 'submitted', confirmed: 'confirmed',
}

/**
 * The size the card says right now. The app's Finger Size custom fields win
 * when set; otherwise the description. "tbc" in the field text always means
 * unconfirmed, whatever the status dropdown says.
 */
export function resolveRingSize(card: { fieldSize: string | null; fieldStatus: string | null; desc: string }): { size: string | null; status: RingStatus } {
  if (card.fieldSize?.trim()) {
    const fromText = readSizeText(card.fieldSize)
    if (fromText.status === 'unconfirmed') return fromText
    const status = card.fieldStatus ? FIELD_STATUS[card.fieldStatus.trim().toLowerCase()] : undefined
    return { size: fromText.size, status: status ?? 'confirmed' }
  }
  return sizeFromDescription(card.desc)
}

/**
 * A description edit only matters if the Finger Size section itself changed
 * (not, say, the metal). Returns the new reading, or null if unchanged.
 */
export function descriptionSizeChange(oldDesc: string, newDesc: string) {
  const before = (descriptionSection(oldDesc, 'Finger Size') ?? '').trim()
  const after  = (descriptionSection(newDesc, 'Finger Size') ?? '').trim()
  return before === after ? null : sizeFromDescription(newDesc)
}

/** For the customer: "we’ve noted around M" (never "around around M"). */
export function noteAround(hint: string) {
  return /^(around|about|approx|approximately|roughly|maybe|between)\b/i.test(hint)
    ? `we’ve noted ${hint}` : `we’ve noted around ${hint}`
}

/**
 * Like resolveRingSize, but the most recent change on the card wins: if the
 * description's Finger Size was edited after the custom fields were last
 * set, the description is used (and vice versa).
 */
export function resolveLatestRingSize(card: {
  fieldSize: string | null; fieldStatus: string | null; desc: string
  descChangedAt: Date | null; fieldsChangedAt: Date | null
}): { size: string | null; status: RingStatus } {
  const fieldsSet = !!card.fieldSize?.trim()
  const descHasSize = !!(descriptionSection(card.desc, 'Finger Size') ?? '').trim()
  if (fieldsSet && descHasSize && card.descChangedAt && (!card.fieldsChangedAt || card.descChangedAt > card.fieldsChangedAt)) {
    return sizeFromDescription(card.desc)
  }
  return resolveRingSize(card)
}
