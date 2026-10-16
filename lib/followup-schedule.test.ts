import { describe, expect, it } from 'vitest'
import { reminderDueAt } from './followup-schedule'
import { sydneyTime } from './working-hours'

const syd = (y: number, m: number, d: number, h: number, mi = 0) => new Date(sydneyTime(y, m, d, h, mi))

describe('reminderDueAt (10am Sydney, calendar days)', () => {
  const published = syd(2026, 10, 16, 21, 30) // Fri 9:30pm
  it('day 2, 4, 7 and REQUIRES CALL on day 8', () => {
    expect(reminderDueAt(published, 1)).toEqual(syd(2026, 10, 18, 10)) // Sun: calendar days
    expect(reminderDueAt(published, 2)).toEqual(syd(2026, 10, 20, 10))
    expect(reminderDueAt(published, 3)).toEqual(syd(2026, 10, 23, 10))
    expect(reminderDueAt(published, 4)).toEqual(syd(2026, 10, 24, 10))
  })
  it('stays at 10am across the daylight-saving change', () => {
    expect(reminderDueAt(syd(2026, 10, 2, 15), 1)).toEqual(syd(2026, 10, 4, 10)) // DST starts 4 Oct
  })
})
