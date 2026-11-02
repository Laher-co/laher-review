import { describe, expect, it } from 'vitest'
import { cleanDesignerName, groupNumber, planDesignerLists } from './designer-lists'

// The board as it is today (positions simplified)
const board = [
  { id: 'a', name: 'ENQUIRIES', pos: 100 },
  { id: 'h1', name: '4.1. Heather | New Design Renders', pos: 200 }, { id: 'h3', name: '4.3 Heather | Revision', pos: 300 },
  { id: 'h4', name: '4.4 Heather | Alterations', pos: 400 }, { id: 'h5', name: '4.5 Heather | Print Ready', pos: 500 },
  { id: 't1', name: 'Tara | New Design Renders', pos: 600 }, { id: 't4', name: 'Tara | Print Ready', pos: 700 },
  { id: 'r1', name: '2.1. Rehan | New Design Renders', pos: 800 }, { id: 'r4', name: '2.4 Rehan | Print Ready', pos: 900 },
  { id: 'e1', name: '3.2 Ekaterina | New Design Renders', pos: 1000 }, { id: 'e4', name: '3.4 Ekaterina | Print Ready', pos: 1100 },
  { id: 'f', name: 'FINISHED | Awaiting Payment', pos: 1600 },
]

describe('planDesignerLists', () => {
  it('creates four lists with the next group number, straight after the last designer', () => {
    const p = planDesignerLists(board, 'Test Designer')
    expect(p.group).toBe(5)
    expect(p.lists.map(l => l.name)).toEqual([
      '5.1 Test Designer | New Design Renders', '5.2 Test Designer | Revision',
      '5.3 Test Designer | Alterations', '5.4 Test Designer | Print Ready',
    ])
    const pos = p.lists.map(l => (l.action === 'create' ? l.pos : 0))
    expect(pos).toEqual([...pos].sort((a, b) => a - b))
    expect(Math.min(...pos)).toBeGreaterThan(1100)
    expect(Math.max(...pos)).toBeLessThan(1600)
  })
  it('reuses lists that already exist and only creates the missing ones', () => {
    const p = planDesignerLists(board, 'Tara')
    expect(p.lists.map(l => l.action)).toEqual(['existing', 'create', 'create', 'existing'])
    expect(p.lists[1].name).toBe('5.2 Tara | Revision')
  })
  it('keeps a designer’s existing group number', () => {
    const p = planDesignerLists(board, 'rehan')
    expect(p.group).toBe(2)
    expect(p.lists[1]).toMatchObject({ action: 'create', name: '2.2 rehan | Revision' })
    const created = p.lists.filter(l => l.action === 'create').map(l => (l as { pos: number }).pos)
    expect(Math.min(...created)).toBeGreaterThan(900)
    expect(Math.max(...created)).toBeLessThan(1000)
  })
  it('does nothing when all four exist', () => {
    expect(planDesignerLists(board, 'Heather').lists.every(l => l.action === 'existing')).toBe(true)
  })
})

describe('names', () => {
  it('cleans and checks the typed name', () => {
    expect(cleanDesignerName('  Test   Designer ')).toEqual({ name: 'Test Designer' })
    expect(cleanDesignerName('')).toHaveProperty('error')
    expect(cleanDesignerName('A | B')).toHaveProperty('error')
    expect(cleanDesignerName('5 Bob')).toHaveProperty('error')
  })
  it('reads group numbers in either style', () => {
    expect(groupNumber('4.1. Heather | New Design Renders')).toBe(4)
    expect(groupNumber('3.2 Ekaterina | Revision')).toBe(3)
    expect(groupNumber('Tara | Revision')).toBeNull()
  })
})
