import { describe, expect, it } from 'vitest'
import { descriptionSizeChange, noteAround, readSizeText, resolveRingSize, sizeFromDescription } from './ring-size'

describe('readSizeText: "tbc" anywhere means unconfirmed, the rest is a hint', () => {
  it.each([
    ['TBC',               null],
    ['tbc',               null],
    ['M (tbc)',           'M'],
    ['tbc - around M',    'around M'],
    ['N TBC',             'N'],
    ['K 1/2 (FS TBC)',    'K 1/2'],
    ['TBC (5-6US)',       '5-6US'],
    ['M TBC?',            'M'],
    ['Mtbc',              'M'],
    ['TBC – J or J½',     'J or J½'],
  ])('%s → unconfirmed, hint %s', (text, hint) => {
    expect(readSizeText(text)).toEqual({ size: hint, status: 'unconfirmed' })
  })

  it.each(['M', 'T 1/2', 'cast at size Y', 'J ½'])('%s → confirmed', text => {
    expect(readSizeText(text)).toEqual({ size: text, status: 'confirmed' })
  })

  it.each(['', '   ', 'N/A', 'none'])('"%s" → unconfirmed, no hint', text => {
    expect(readSizeText(text)).toEqual({ size: null, status: 'unconfirmed' })
  })
})

describe('sizeFromDescription', () => {
  const card = (size: string) => `**Name:**\nLiam\n\n**Finger Size:**\n\n${size}\n\n**Metal:**\n18ct YG`
  it('reads the Finger Size section', () => {
    expect(sizeFromDescription(card('M (tbc)'))).toEqual({ size: 'M', status: 'unconfirmed' })
    expect(sizeFromDescription(card('J 1/2'))).toEqual({ size: 'J 1/2', status: 'confirmed' })
    expect(sizeFromDescription('**Name:**\nNo size here')).toEqual({ size: null, status: 'unconfirmed' })
  })
})

describe('resolveRingSize: custom fields win, but "tbc" is always unconfirmed', () => {
  it('uses the status field with a plain size', () => {
    expect(resolveRingSize({ fieldSize: 'N', fieldStatus: 'Customer submitted', desc: '' })).toEqual({ size: 'N', status: 'submitted' })
    expect(resolveRingSize({ fieldSize: 'N', fieldStatus: 'Confirmed', desc: '' })).toEqual({ size: 'N', status: 'confirmed' })
    expect(resolveRingSize({ fieldSize: 'M', fieldStatus: 'Unconfirmed', desc: '' })).toEqual({ size: 'M', status: 'unconfirmed' })
  })
  it('"tbc" in the field overrides a Confirmed dropdown', () => {
    expect(resolveRingSize({ fieldSize: 'M tbc', fieldStatus: 'Confirmed', desc: '' })).toEqual({ size: 'M', status: 'unconfirmed' })
  })
  it('falls back to the description when the field is empty', () => {
    expect(resolveRingSize({ fieldSize: null, fieldStatus: null, desc: '**Finger Size:**\nN TBC' })).toEqual({ size: 'N', status: 'unconfirmed' })
  })
})

describe('descriptionSizeChange', () => {
  const d = (size: string, metal = '18ct YG') => `**Finger Size:**\n${size}\n\n**Metal:**\n${metal}`
  it('ignores edits elsewhere in the description', () => {
    expect(descriptionSizeChange(d('M'), d('M', 'Platinum'))).toBeNull()
  })
  it('reports a changed Finger Size section', () => {
    expect(descriptionSizeChange(d('M (tbc)'), d('M'))).toEqual({ size: 'M', status: 'confirmed' })
    expect(descriptionSizeChange(d('M'), d('tbc - around M'))).toEqual({ size: 'around M', status: 'unconfirmed' })
  })
})

describe('noteAround', () => {
  it('reads naturally', () => {
    expect(noteAround('M')).toBe('we’ve noted around M')
    expect(noteAround('around M')).toBe('we’ve noted around M')
  })
})

import { resolveLatestRingSize } from './ring-size'
describe('resolveLatestRingSize: the latest change on the card wins', () => {
  const desc = '**Finger Size:**\n\nTBC'
  const fields = { fieldSize: 'M', fieldStatus: 'Confirmed', desc }
  it('uses the description when it was edited after the fields', () => {
    expect(resolveLatestRingSize({ ...fields, descChangedAt: new Date('2026-10-16T02:00Z'), fieldsChangedAt: new Date('2026-10-15T03:00Z') }))
      .toEqual({ size: null, status: 'unconfirmed' })
  })
  it('uses the fields when they were set after the description', () => {
    expect(resolveLatestRingSize({ ...fields, descChangedAt: new Date('2026-10-14T02:00Z'), fieldsChangedAt: new Date('2026-10-15T03:00Z') }))
      .toEqual({ size: 'M', status: 'confirmed' })
  })
  it('uses the fields when the description has never been edited', () => {
    expect(resolveLatestRingSize({ ...fields, descChangedAt: null, fieldsChangedAt: new Date('2026-10-15T03:00Z') }))
      .toEqual({ size: 'M', status: 'confirmed' })
  })
})
