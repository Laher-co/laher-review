// Working time for response targets: Mon–Fri, 9am–5pm Sydney, excluding NSW
// public holidays (from the date-holidays library, so no list to maintain).
import Holidays from 'date-holidays'

const TZ = 'Australia/Sydney'
const OPEN_HOUR = 9, CLOSE_HOUR = 17
const nsw = new Holidays('AU', 'NSW')
const holidayCache = new Map<number, Set<string>>()

function holidays(year: number) {
  let set = holidayCache.get(year)
  if (!set) {
    set = new Set(nsw.getHolidays(year).filter(h => h.type === 'public').map(h => h.date.slice(0, 10)))
    holidayCache.set(year, set)
  }
  return set
}

/** Sydney calendar date and weekday for an instant. */
function sydneyDay(t: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date(t)).map(x => [x.type, x.value]))
  return { y: +p.year, m: +p.month, d: +p.day, iso: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday }
}

/** The instant for a Sydney wall-clock time (handles daylight saving). */
export function sydneyTime(y: number, m: number, d: number, hour: number, minute = 0) {
  let guess = Date.UTC(y, m - 1, d, hour, minute) - 10 * 3600_000
  for (let i = 0; i < 3; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(guess)).map(x => [x.type, x.value]))
    const asIfUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute)
    guess += Date.UTC(y, m - 1, d, hour, minute) - asIfUtc
  }
  return guess
}

export function isWorkday(t: number) {
  const day = sydneyDay(t)
  return !['Sat', 'Sun'].includes(day.weekday) && !holidays(day.y).has(day.iso)
}

/** Working-hours window [open, close] for the Sydney day containing t, or null on a non-workday. */
function windowFor(t: number): [number, number] | null {
  if (!isWorkday(t)) return null
  const { y, m, d } = sydneyDay(t)
  return [sydneyTime(y, m, d, OPEN_HOUR), sydneyTime(y, m, d, CLOSE_HOUR)]
}

/** Noon on the next Sydney calendar day (a safe point inside that day). */
function nextDay(t: number) {
  const { y, m, d } = sydneyDay(t)
  return sydneyTime(y, m, d, 12) + 24 * 3600_000
}

/** Working minutes between two instants. */
export function workingMinutesBetween(from: Date, to: Date) {
  let total = 0
  let t = from.getTime()
  const end = to.getTime()
  for (let i = 0; i < 400 && t < end; i++) {
    const w = windowFor(t)
    if (w) total += Math.max(0, Math.min(end, w[1]) - Math.max(t, w[0]))
    const n = sydneyDay(nextDay(t))
    t = sydneyTime(n.y, n.m, n.d, 0)
  }
  return Math.round(total / 60_000)
}

/** The instant that is `minutes` working minutes after `from` (e.g. the OVERDUE deadline). */
export function addWorkingMinutes(from: Date, minutes: number) {
  let remaining = minutes * 60_000
  let t = from.getTime()
  for (let i = 0; i < 400; i++) {
    const w = windowFor(t)
    if (w && t < w[1]) {
      const start = Math.max(t, w[0])
      if (start + remaining <= w[1]) return new Date(start + remaining)
      remaining -= w[1] - start
    }
    const n = sydneyDay(nextDay(t))
    t = sydneyTime(n.y, n.m, n.d, 0)
  }
  throw new Error('Working-time calculation ran past 400 days')
}

/** e.g. "2h 15m" */
export function formatMinutes(min: number) {
  const h = Math.floor(min / 60), m = min % 60
  return h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`
}

/** Monday 00:00 Sydney of the week containing `d`. */
export function weekStart(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(d).map(x => [x.type, x.value]))
  const back = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday)
  const noon = sydneyTime(+p.year, +p.month, +p.day, 12) - back * 86_400_000
  const m = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(noon)).map(x => [x.type, x.value]))
  return new Date(sydneyTime(+m.year, +m.month, +m.day, 0))
}

