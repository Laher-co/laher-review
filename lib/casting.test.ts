import { describe, expect, it } from 'vitest'
import { beforeCasting, businessDaysBetween, castDate, castingState, dateMismatch, datesIn, isBusinessDay, longDay, shortDay, sydneyDate } from './casting'

const today = '2026-11-23' // Monday

describe('dates', () => {
  it('reads the due date as a Sydney calendar date', () => {
    expect(sydneyDate('2026-12-07T22:02:00.000Z')).toBe('2026-12-08')
    expect(sydneyDate('2026-11-30T03:46:00.000Z')).toBe('2026-11-30')
  })
  it('business days skip weekends and NSW public holidays', () => {
    expect(isBusinessDay('2026-11-23')).toBe(true)
    expect(isBusinessDay('2026-11-28')).toBe(false)   // Saturday
    expect(isBusinessDay('2026-12-25')).toBe(false)   // Christmas
    expect(isBusinessDay('2026-12-28')).toBe(false)   // Boxing Day (substitute)
    expect(isBusinessDay('2027-01-26')).toBe(false)   // Australia Day
  })
  it('cast date is 7 business days before the due date', () => {
    expect(castDate('2026-12-08')).toBe('2026-11-27')
    expect(castDate('2026-12-07')).toBe('2026-11-26')
    // across Christmas and Boxing Day: Dec 31, 30, 29, 24, 23, 22, 21
    expect(castDate('2027-01-04')).toBe('2026-12-21')
  })
  it('counts business days after today up to and including the cast date', () => {
    expect(businessDaysBetween('2026-11-23', '2026-11-27')).toBe(4)
    expect(businessDaysBetween('2026-11-27', '2026-11-30')).toBe(1)
  })
})

describe('the four live cards (23 Nov 2026)', () => {
  it('Kiran Bath: 4 days', () => {
    expect(castingState({ due: '2026-12-07T22:02:00.000Z', listName: '4.3 Heather | Revision' }, today))
      .toEqual({ kind: 'countdown', daysLeft: 4, cast: '2026-11-27', due: '2026-12-08' })
  })
  it('Lachlan Horvath: 3 days (the due "complete" tick is ignored)', () => {
    expect(castingState({ due: '2026-12-06T20:46:00.000Z', listName: '5.2 Aaron | Revision' }, today))
      .toEqual({ kind: 'countdown', daysLeft: 3, cast: '2026-11-26', due: '2026-12-07' })
  })
  it('Chin Leung: past, 2 business days over', () => {
    expect(castingState({ due: '2026-11-30T03:46:00.000Z', listName: '4.5 Heather | Print Ready' }, today))
      .toEqual({ kind: 'past', daysOver: 2, cast: '2026-11-19', due: '2026-11-30' })
  })
  it('Christian Schwarzbach: past, 3 business days over', () => {
    expect(castingState({ due: '2026-11-26T21:22:00.000Z', listName: '2.4 Rehan | Print Ready' }, today))
      .toEqual({ kind: 'past', daysOver: 3, cast: '2026-11-18', due: '2026-11-27' })
  })
})

describe('when it shows', () => {
  const due = '2026-12-07T22:02:00.000Z' // cast Fri 27 Nov
  it('from 5 business days left, counting down, then today, then past', () => {
    expect(castingState({ due, listName: 'Tara | Alterations' }, '2026-11-19')).toBeNull()          // 6 left
    expect(castingState({ due, listName: 'Tara | Alterations' }, '2026-11-20')).toMatchObject({ kind: 'countdown', daysLeft: 5 })
    expect(castingState({ due, listName: 'Tara | Alterations' }, '2026-11-26')).toMatchObject({ kind: 'countdown', daysLeft: 1 })
    expect(castingState({ due, listName: 'Tara | Alterations' }, '2026-11-27')).toMatchObject({ kind: 'today' })
    expect(castingState({ due, listName: 'Tara | Alterations' }, '2026-11-28')).toMatchObject({ kind: 'past', daysOver: 0 })
    expect(castingState({ due, listName: 'Tara | Alterations' }, '2026-11-30')).toMatchObject({ kind: 'past', daysOver: 1 })
  })
  it('only before casting', () => {
    for (const l of ['4.1. Heather | New Design Renders', 'Tara | Revision', '3.3 Ekaterina | Alterations', '2.4 Rehan | Print Ready', 'REQUIRES SOURCING'])
      expect(beforeCasting(l)).toBe(true)
    for (const l of ['2.2 Casting', '2.1 Ready For Printing', '3. Production (Tier One)', 'FINISHED', 'RESOURCES'])
      expect(beforeCasting(l)).toBe(false)
    expect(castingState({ due, listName: '2.2 Casting' }, '2026-11-26')).toBeNull()
  })
  it('no due date: nothing', () => {
    expect(castingState({ due: null, listName: 'Tara | Revision' }, today)).toBeNull()
  })
})

describe('date mismatch', () => {
  it('Chin Leung: “before the 3rd of December” vs due 30 Nov; engraving dates ignored', () => {
    const desc = '**HARD DUE DATE!**\n**NEEDS THE RING BEFORE THE 3rd OF DECEMBER**\n**Finger Size:**\nI 1/2\n2\\.54ct VVS2, 9.23 x 6.87 x 4.65 mm\n**ENGRAVING: 11.10.26**'
    expect(dateMismatch([desc], '2026-11-30')).toBe('2026-12-03')
    expect(dateMismatch(['**ENGRAVING: 11.10.26**'], '2026-11-30')).toBeNull()
  })
  it('reads common formats, not sizes or prices', () => {
    expect(datesIn('ready by 3 Dec, or December 5th, or 8/12/2026', '2026-11-30')).toEqual(['2026-12-03', '2026-12-05', '2026-12-08'])
    expect(datesIn('Finger Size: I 1/2 · 9.04 x 5.53mm · Paid: 3905.00 · 2.65ct', '2026-11-30')).toEqual([])
    expect(datesIn('[link](https://x.com/2026/12/03) https://y.com/3-12-26', '2026-11-30')).toEqual([])
  })
  it('the due date itself, or a date far away, is not a mismatch', () => {
    expect(dateMismatch(['Due 30th November'], '2026-11-30')).toBeNull()
    expect(dateMismatch(['Ordered 14 August'], '2026-11-30')).toBeNull()
  })
})

it('wording', () => {
  expect(shortDay('2026-11-27')).toBe('Fri 27 Nov')
  expect(longDay('2026-11-27')).toBe('Friday 27 November')
})
