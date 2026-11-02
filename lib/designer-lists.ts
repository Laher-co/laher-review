// Pure planning for "Add designer": which of the designer's four funnel lists
// already exist, and what to call and where to put the missing ones. No
// network calls, so it's unit tested.
import { findStageList, parseDesignerList, STAGES, type Stage } from './trello-parse'

export type BoardList = { id: string; name: string; pos: number }

export type ListPlan = {
  group: number
  lists: ({ stage: Stage } & ({ action: 'existing'; id: string; name: string } | { action: 'create'; name: string; pos: number }))[]
}

/** Cleans up a typed designer name; returns an error message if it can't be used. */
export function cleanDesignerName(raw: string): { name: string } | { error: string } {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (!name) return { error: 'Enter the designer’s name.' }
  if (name.length > 40) return { error: 'Keep the name under 40 characters.' }
  if (/[|]/.test(name)) return { error: 'The name can’t contain “|”.' }
  if (/^\d/.test(name)) return { error: 'The name can’t start with a number.' }
  return { name }
}

/** The group number at the start of a list name: "4.3 Heather | Revision" → 4. */
export const groupNumber = (listName: string) => {
  const m = listName.match(/^\s*(\d+)\s*\./)
  return m ? Number(m[1]) : null
}

/**
 * Plans the designer's lists: reuse any that exist (any numbering), and create
 * the missing ones named "<group>.<n> <Name> | <Stage>" as one block in stage
 * order, straight after the last designer funnel list on the board. The group
 * is the designer's existing number if they have one, otherwise the highest
 * group on the board plus one.
 */
export function planDesignerLists(boardLists: BoardList[], name: string): ListPlan {
  const lists = [...boardLists].sort((a, b) => a.pos - b.pos)
  const funnel = lists.filter(l => parseDesignerList(l.name))
  const own = funnel.filter(l => parseDesignerList(l.name)!.designer.toLowerCase() === name.toLowerCase())
  const ownGroup = own.map(l => groupNumber(l.name)).find(g => g !== null)
  const group = ownGroup ?? Math.max(0, ...funnel.map(l => groupNumber(l.name) ?? 0)) + 1

  const missing = STAGES.filter(s => !findStageList(lists, name, s))
  // Straight after the designer's own lists if some exist, otherwise after the last designer's block
  const anchor = (own.length ? own : funnel).at(-1) ?? lists.at(-1)
  const anchorPos = anchor?.pos ?? 0
  const nextPos = lists.find(l => l.pos > anchorPos)?.pos
  const step = nextPos !== undefined ? (nextPos - anchorPos) / (missing.length + 1) : 16384

  let k = 0
  return {
    group,
    lists: STAGES.map(stage => {
      const found = findStageList(lists, name, stage)
      if (found) return { stage, action: 'existing' as const, id: found.id, name: found.name }
      k++
      return { stage, action: 'create' as const, name: `${group}.${STAGES.indexOf(stage) + 1} ${name} | ${stage}`, pos: anchorPos + step * k }
    }),
  }
}
