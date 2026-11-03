import { describe, expect, it } from 'vitest'
import {
  parseDesignerList, findStageList, descriptionSection, parseCardRef, extractEmail, alterationsPlan, designerChange,
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

describe('alterationsPlan (customer sent something in the portal)', () => {
  const lists = [
    { id: 'h1', name: '4.1. Heather | New Design Renders' }, { id: 'h3', name: '4.3 Heather | Revision' },
    { id: 'h4', name: '4.4 Heather | Alterations' }, { id: 'h5', name: '4.5 Heather | Print Ready' },
    { id: 't4', name: 'Tara | Alterations' }, { id: 'c', name: 'Casting' },
  ]
  it('moves from Revision to Alterations in the same designer’s funnel', () => {
    expect(alterationsPlan([], '4.3 Heather | Revision', lists)).toMatchObject({ action: 'move', from: '4.3 Heather | Revision', target: { id: 'h4' } })
  })
  it('leaves every other list alone', () => {
    for (const l of ['4.5 Heather | Print Ready', '4.4 Heather | Alterations', '4.1. Heather | New Design Renders', 'Casting', '2.0 Awaiting Printing']) {
      expect(alterationsPlan([], l, lists).action).toBe('skip')
    }
  })
  it('skips OLD SYSTEM cards, whatever the case', () => {
    expect(alterationsPlan(['Review App', 'Old System'], '4.3 Heather | Revision', lists)).toEqual({ action: 'skip', reason: 'Card has the “OLD SYSTEM” label' })
  })
  it('reports a missing Alterations list for that designer', () => {
    expect(alterationsPlan([], 'Rehan | Revision', lists)).toEqual({ action: 'no_list', designer: 'Rehan' })
  })
})

describe('designerChange', () => {
  it('spots a move to another designer, whatever the stage or numbering', () => {
    expect(designerChange('4.1. Heather | New Design Renders', 'Tara | New Design Renders')).toEqual({ from: 'Heather', to: 'Tara' })
    expect(designerChange('2.2 Rehan | Revision', '5.4 Aaron | Print Ready')).toEqual({ from: 'Rehan', to: 'Aaron' })
  })
  it('ignores moves within one designer’s funnel and to or from other lists', () => {
    expect(designerChange('4.3 Heather | Revision', '4.4 heather | Alterations')).toBeNull()
    expect(designerChange('REQUIRES SOURCING', 'Tara | Print Ready')).toBeNull()
    expect(designerChange('Tara | Print Ready', '2.0 Awaiting Printing')).toBeNull()
  })
})
