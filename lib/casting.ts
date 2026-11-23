// Casting date alert. Pure rules (no I/O), unit tested.
//
// - Source: the Trello card's due date, read as a Sydney calendar date. The
//   due "complete" tick is ignored.
// - Cast date = due date minus 7 business days (Mon–Fri, not NSW public holidays).
// - Business days left = business days after today, up to and including the cast date.
// - Shown with 5 or fewer left (5 → 1), then "past". On the cast date itself: "today".
// - Only while the card is before casting: a designer list (New Design Renders,
//   Revision, Alterations, Print Ready) or REQUIRES SOURCING.

import { parseDesignerList } from './trello-parse'

export const CAST_LEAD_DAYS = 7
export const ALERT_FROM_DAYS = 5

/** NSW public holidays that fall on weekdays (plus their weekend substitutes). Add each new year. */
export const NSW_HOLIDAYS = new Set([
  // 2026
  '2026-01-01', '2026-01-26', '2026-04-03', '2026-04-06', '2026-06-08', '2026-10-05', '2026-12-25', '2026-12-28',
  // 2027
  '2027-01-01', '2027-01-26', '2027-03-26', '2027-03-29', '2027-06-14', '2027-10-04', '2027-12-27', '2027-12-28',
  // 2028
  '2028-01-03', '2028-01-26', '2028-04-14', '2028-04-17', '2028-04-25', '2028-06-12', '2028-10-02', '2028-12-25', '2028-12-26',
])
export const HOLIDAYS_COVER_UNTIL = '2028-12-31'

// Dates are plain 'YYYY-MM-DD' strings (Sydney calendar days), handled in UTC to avoid DST shifts
const toUtc = (d: string) => new Date(`${d}T00:00:00Z`)
const fromUtc = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (d: string, n: number) => { const x = toUtc(d); x.setUTCDate(x.getUTCDate() + n); return fromUtc(x) }

/** The Sydney calendar date of an instant (e.g. a Trello due date). */
export function sydneyDate(instant: Date | string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(instant))
}

export function isBusinessDay(d: string) {
  const dow = toUtc(d).getUTCDay()
  return dow !== 0 && dow !== 6 && !NSW_HOLIDAYS.has(d)
}

/** Due date minus 7 business days. */
export function castDate(due: string, lead = CAST_LEAD_DAYS) {
  let d = due, n = 0
  while (n < lead) { d = addDays(d, -1); if (isBusinessDay(d)) n++ }
  return d
}

/** Business days in (from, to]: after `from`, up to and including `to`. */
export function businessDaysBetween(from: string, to: string) {
  let n = 0
  for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isBusinessDay(d)) n++
  return n
}

/** Before casting: a designer list (any stage) or REQUIRES SOURCING. */
export function beforeCasting(listName: string) {
  return !!parseDesignerList(listName) || listName.trim().toLowerCase() === 'requires sourcing'
}

export type CastingState =
  | { kind: 'countdown'; daysLeft: number; cast: string; due: string }
  | { kind: 'today'; cast: string; due: string }
  | { kind: 'past'; daysOver: number; cast: string; due: string }

/** The alert for a card, or null (no due date, not before casting, or more than 5 business days left). */
export function castingState(card: { due: string | null | undefined; listName: string }, today: string): CastingState | null {
  if (!card.due || !beforeCasting(card.listName)) return null
  const due = sydneyDate(card.due)
  const cast = castDate(due)
  if (today === cast) return { kind: 'today', cast, due }
  if (today < cast) {
    const daysLeft = businessDaysBetween(today, cast)
    return daysLeft <= ALERT_FROM_DAYS ? { kind: 'countdown', daysLeft, cast, due } : null
  }
  return { kind: 'past', daysOver: businessDaysBetween(cast, today), cast, due }
}

// ── Date mismatch ─────────────────────────────────────────────────────────────
// Dates written in the card description or comments that differ from the due
// date. Australian order (day/month). Numeric dates need a year (so ring sizes
// like "I 1/2" and stone sizes like "9.04 x 5.53" aren't read as dates). Lines
// about engraving are ignored, and so are dates far from the due date.

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?'
export const MISMATCH_WINDOW_DAYS = 45

const pad = (n: number) => String(n).padStart(2, '0')
const valid = (y: number, m: number, d: number) => {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const s = `${y}-${pad(m)}-${pad(d)}`
  return fromUtc(toUtc(s)) === s ? s : null
}
/** Without a year: the year that puts it closest to the reference date. */
function nearest(m: number, d: number, ref: string) {
  const y = Number(ref.slice(0, 4))
  const options = [y - 1, y, y + 1].map(yy => valid(yy, m, d)).filter((x): x is string => !!x)
  return options.sort((a, b) => Math.abs(+toUtc(a) - +toUtc(ref)) - Math.abs(+toUtc(b) - +toUtc(ref)))[0] ?? null
}

/** Every date mentioned in the text (as 'YYYY-MM-DD'). */
export function datesIn(text: string, ref: string): string[] {
  const out: string[] = []
  const lines = text
    .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')          // markdown links
    .replace(/https?:\/\/\S+/g, ' ')                // bare links
    .split(/\n/)
    .filter(l => !/engrav/i.test(l))
  for (const line of lines) {
    const l = line.toLowerCase().replace(/\\/g, '')
    for (const m of l.matchAll(new RegExp(`\\b${DAY}\\s*(?:of\\s+)?${MONTH}\\b(?:,?\\s*(\\d{4}))?`, 'g'))) {
      const mon = MONTHS.indexOf(m[2].slice(0, 3)) + 1
      const d = m[3] ? valid(Number(m[3]), mon, Number(m[1])) : nearest(mon, Number(m[1]), ref)
      if (d) out.push(d)
    }
    for (const m of l.matchAll(new RegExp(`\\b${MONTH}\\s+${DAY}\\b(?:,?\\s*(\\d{4}))?`, 'g'))) {
      const mon = MONTHS.indexOf(m[1].slice(0, 3)) + 1
      const d = m[3] ? valid(Number(m[3]), mon, Number(m[2])) : nearest(mon, Number(m[2]), ref)
      if (d) out.push(d)
    }
    for (const m of l.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/g)) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
      const d = valid(y, Number(m[2]), Number(m[1]))
      if (d) out.push(d)
    }
  }
  return [...new Set(out)]
}

/** A date near the due date that isn't the due date, or null. */
export function dateMismatch(texts: string[], due: string): string | null {
  const window = MISMATCH_WINDOW_DAYS * 86_400_000
  for (const t of texts) {
    for (const d of datesIn(t, due)) {
      if (d !== due && Math.abs(+toUtc(d) - +toUtc(due)) <= window) return d
    }
  }
  return null
}

// ── Wording ──────────────────────────────────────────────────────────────────

/** "Fri 27 Nov" */
export const shortDay = (d: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(toUtc(d)).replace(',', '')
/** "Friday 27 November" */
export const longDay = (d: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(toUtc(d)).replace(',', '')
/** "8 December" */
export const dayMonth = (d: string) =>
  new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(toUtc(d))

export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
