// Sydney local time helpers (handles daylight saving via the time zone database)

const parts = (d: Date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(d).map(p => [p.type, p.value]),
)

/** e.g. "2026-10-16" in Sydney */
export function sydneyDate(d = new Date()) {
  const p = parts(d)
  return `${p.year}-${p.month}-${p.day}`
}

/** 0–23 in Sydney */
export function sydneyHour(d = new Date()) {
  return Number(parts(d).hour) % 24
}
