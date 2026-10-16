import { describe, expect, it } from 'vitest'
import { addWorkingMinutes, sydneyTime, workingMinutesBetween } from './working-hours'

const syd = (s: string) => { // "2026-10-16 20:00"
  const [d, t] = s.split(' '); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number)
  return new Date(sydneyTime(y, m, dd, h, mi))
}

describe('addWorkingMinutes (4 working hours = OVERDUE)', () => {
  it('within a working day', () => {
    expect(addWorkingMinutes(syd('2026-10-14 10:00'), 240)).toEqual(syd('2026-10-14 14:00'))
  })
  it('carries over to the next morning', () => {
    expect(addWorkingMinutes(syd('2026-10-14 15:00'), 240)).toEqual(syd('2026-10-15 11:00'))
  })
  it('a Friday 8pm message is overdue at 1pm Monday', () => {
    expect(addWorkingMinutes(syd('2026-10-16 20:00'), 240)).toEqual(syd('2026-10-19 13:00'))
  })
  it('skips the Labour Day public holiday (Mon 5 Oct 2026)', () => {
    expect(addWorkingMinutes(syd('2026-10-02 16:00'), 240)).toEqual(syd('2026-10-06 12:00'))
  })
  it('handles the daylight-saving change (Sun 4 Oct 2026)', () => {
    expect(addWorkingMinutes(syd('2026-10-02 13:00'), 240)).toEqual(syd('2026-10-02 17:00'))
    expect(addWorkingMinutes(syd('2026-10-03 09:00'), 60)).toEqual(syd('2026-10-06 10:00'))
  })
  it('skips Christmas and Boxing Day substitute', () => {
    expect(addWorkingMinutes(syd('2026-12-24 16:00'), 240)).toEqual(syd('2026-12-29 12:00'))
  })
})

describe('workingMinutesBetween', () => {
  it('counts only working time', () => {
    expect(workingMinutesBetween(syd('2026-10-16 16:00'), syd('2026-10-19 10:30'))).toBe(150)
  })
  it('is zero over a weekend', () => {
    expect(workingMinutesBetween(syd('2026-10-17 10:00'), syd('2026-10-18 16:00'))).toBe(0)
  })
  it('matches addWorkingMinutes', () => {
    const start = syd('2026-10-14 15:30')
    expect(workingMinutesBetween(start, addWorkingMinutes(start, 240))).toBe(240)
  })
})

import { weekStart } from './working-hours'
describe('weekStart', () => {
  it('is Monday 00:00 Sydney', () => {
    expect(weekStart(syd('2026-10-16 10:00'))).toEqual(syd('2026-10-12 00:00'))
    expect(weekStart(syd('2026-10-12 00:30'))).toEqual(syd('2026-10-12 00:00'))
    expect(weekStart(syd('2026-10-18 23:00'))).toEqual(syd('2026-10-12 00:00'))
  })
  it('handles the daylight-saving week', () => {
    expect(weekStart(syd('2026-10-06 09:00'))).toEqual(syd('2026-10-05 00:00'))
  })
})
