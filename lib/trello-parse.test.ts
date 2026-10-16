import { describe, expect, it } from 'vitest'
import {
  parseDesignerList, findStageList, parseRingSize, descriptionSection, parseCardRef, extractEmail,
} from './trello-parse'

describe('parseDesignerList', () => {
  it.each([
    ['4.3 Heather | Revision',              'Heather',   'Revision'],
    ['4.1. Heather | New Design Renders',   'Heather',   'New Design Renders'],
    ['Tara | Print Ready',                  'Tara',      'Print Ready'],
    ['3.2 Ekaterina | Revision',            'Ekaterina', 'Revision'],
    ['3.2 Ekaterina | New Design Renders',  'Ekaterina', 'New Design Renders'],
    ['2.3 Rehan | alterations',             'Rehan',     'Alterations'],
    ['  2.4 Rehan  |  Print  Ready ',       'Rehan',     'Print Ready'],
  ])('%s', (name, designer, stage) => {
    expect(parseDesignerList(name)).toEqual({ designer, stage })
  })

  it.each([
    '1. Design Stage (New Orders)',
    '2.2 Casting',
    'FINISHED | Awaiting Payment',
    'Finished | Awaiting Dispatch Info (resizes/paid in full)',
    'CLEARED TO SHIP >>',
  ])('ignores non-designer list %s', name => {
    expect(parseDesignerList(name)).toBeNull()
  })
})

describe('findStageList', () => {
  const lists = [
    { id: 'h1', name: '4.1. Heather | New Design Renders' },
    { id: 'h3', name: '4.3 Heather | Revision' },
    { id: 'h4', name: '4.4 Heather | Alterations' },
    { id: 't2', name: 'Tara | Revision' },
    { id: 't3', name: 'Tara | Alterations' },
  ]
  it('stays with the same designer', () => {
    expect(findStageList(lists, 'Tara', 'Revision')?.id).toBe('t2')
    expect(findStageList(lists, 'heather', 'Alterations')?.id).toBe('h4')
  })
  it('returns undefined when that designer has no such list', () => {
    expect(findStageList(lists, 'Tara', 'Print Ready')).toBeUndefined()
  })
})

describe('parseRingSize', () => {
  const card = (size: string) =>
    `**Name:**\nLiam Kilpatrick\n\n**Finger Size:**\n${size}\n\n**Gemstones:**\nPearl`

  it('reads a plain size as confirmed', () => {
    expect(parseRingSize(card('T 1/2'))).toEqual({ size: 'T 1/2', status: 'confirmed', note: null })
  })
  it('handles a blank line after the heading', () => {
    expect(parseRingSize(card('\nJ 1/2')).size).toBe('J 1/2')
  })
  it('treats TBC as unconfirmed and keeps the hint', () => {
    expect(parseRingSize(card('TBC (5-6US)'))).toEqual({ size: null, status: 'unconfirmed', note: 'TBC (5-6US)' })
  })
  it('treats a missing heading as unconfirmed', () => {
    expect(parseRingSize('**Name:**\nSomeone')).toEqual({ size: null, status: 'unconfirmed', note: null })
  })
  it('keeps descriptive sizes as written', () => {
    expect(parseRingSize(card('cast at size Y')).size).toBe('cast at size Y')
  })
})

describe('descriptionSection', () => {
  it('unescapes Trello markdown and stops at the next heading', () => {
    const d = '**Band Thickness:**\n1\\.80mm\n\n---\n\nNOTES;'
    expect(descriptionSection(d, 'Band Thickness')).toBe('1.80mm')
  })
})

describe('parseCardRef', () => {
  it('reads card URLs, short links and ids', () => {
    expect(parseCardRef('https://trello.com/c/BVgMhPjV/3637-liamkilp13gmailcom')).toBe('BVgMhPjV')
    expect(parseCardRef('BVgMhPjV')).toBe('BVgMhPjV')
    expect(parseCardRef('6a83931e846b1b2a041b6a00')).toBe('6a83931e846b1b2a041b6a00')
    expect(parseCardRef('not a card')).toBeNull()
  })
})

describe('extractEmail', () => {
  it('finds the first email', () => {
    expect(extractEmail('Puffy Signets', 'Contact: Liam@Example.com')).toBe('liam@example.com')
    expect(extractEmail('no email here')).toBeNull()
  })
})

import { isEmailOnlyName } from './trello-parse'

describe('isEmailOnlyName', () => {
  it.each([
    'john@example.com', '  John@Example.COM  ', 'williamkneale95@gmail.com', 'first.last+ring@mail.co.uk',
  ])('accepts %s', n => expect(isEmailOnlyName(n)).toBe(true))
  it.each([
    'john@example.com resize', 'john@example.com - alteration', 'Resize john@example.com',
    'john@example.com, jane@example.com', 'Stock - Baguette Wedder', 'john@example', '@example.com', '',
  ])('rejects %s', n => expect(isEmailOnlyName(n)).toBe(false))
})
