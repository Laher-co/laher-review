// When each follow-up step is due, at 10am Sydney on calendar days after the
// clock started:
//   'first' (Version One):   reminders on day 2, 4, 7 → REQUIRES CALL on day 8
//   'later' (Version Two+):  one reminder on day 2 → FOLLOW UP on day 4
//   size sequences use 'first' timing (day 2, 4, 7 → REQUIRES CALL – SIZE)
import { sydneyTime } from './working-hours'

export const REMINDER_DAYS = { first: [2, 4, 7, 8], later: [2, 4] } as const
export type Plan = keyof typeof REMINDER_DAYS

const ymd = (d: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(d).map(x => [x.type, x.value]))

export function reminderDueAt(startedAt: Date, step: number, plan: Plan = 'first') {
  const days = REMINDER_DAYS[plan][step - 1]
  const p = ymd(startedAt)
  // Noon on the start day plus N days lands safely on the right calendar day, even across DST
  const t = ymd(new Date(sydneyTime(+p.year, +p.month, +p.day, 12) + days * 86_400_000))
  return new Date(sydneyTime(+t.year, +t.month, +t.day, 10))
}

/** Staff-facing status, e.g. "Reminder 2 sent", "REQUIRES CALL – SIZE", "FOLLOW UP". */
export function followupLabel(f: { kind: 'design' | 'size'; status: string; remindersSent: number; plan?: string }) {
  const size = f.kind === 'size' ? ' – SIZE' : ''
  if (f.status === 'requires_call') return `REQUIRES CALL${size}`
  if (f.status === 'follow_up') return `FOLLOW UP${size}`
  if (f.remindersSent > 0) {
    if (f.plan === 'later') return 'Reminder sent'
    return `${f.kind === 'size' ? 'Size reminder' : 'Reminder'} ${f.remindersSent} sent`
  }
  return f.kind === 'size' ? 'Waiting for ring size' : 'Waiting for customer'
}
