// "Stone not secured" and the REQUIRES SOURCING list. Pure, so it's unit tested.
import { parseDesignerList } from './trello-parse'

export const LABEL_STONE = 'STONE NEEDS SOURCING'
export const LABEL_DESIGN_APPROVED = 'DESIGN APPROVED'
export const LABEL_OLD_SYSTEM = 'OLD SYSTEM'
export const SOURCING_LIST = 'REQUIRES SOURCING'

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
export const isSourcingList = (name: string | undefined | null) => !!name && same(name, SOURCING_LIST)
export const hasLabel = (labels: { name: string }[], name: string) => labels.some(l => same(l.name, name))

/**
 * The gemstone details from a card description: the text under a heading that
 * starts with "Gemstone" ("**Gemstones:**", "**Gemstones/Diamonds;**"), up to the
 * next bold heading. If there's no such heading, the whole description.
 */
export function gemstoneDetails(desc: string): string {
  const lines = desc.split('\n')
  const start = lines.findIndex(l => /^\s*\*\*\s*gemstone/i.test(l))
  if (start === -1) return desc.trim()
  const out: string[] = []
  for (const line of lines.slice(start)) {
    if (out.length && /^\s*\*\*.+\*\*/.test(line)) break
    out.push(line)
  }
  return out.join('\n').replace(/\\(.)/g, '$1').replace(/[​-‍﻿]/g, '').trim()
}

/** "ct TBC" in any case, with or without brackets: "(ct TBC)", "1.5 ct tbc", "1.2ct (TBC)", "ct: tbc". */
export const hasCaratTbc = (text: string) => /ct\b[\s.:\-–—()[\]]*tbc\b/i.test(text)

/** What a person moving a card out of REQUIRES SOURCING means for the job. */
export function sourcingExit(listAfter: string, designer: string | null):
  'print_ready' | 'alterations' | { issue: string } {
  const funnel = parseDesignerList(listAfter)
  if (!funnel) return { issue: `to “${listAfter}”, which isn’t a designer list` }
  if (designer && funnel.designer.toLowerCase() !== designer.toLowerCase()) {
    return { issue: `to another designer’s list (“${listAfter}”; the job is ${designer}’s)` }
  }
  if (funnel.stage === 'Print Ready') return 'print_ready'
  if (funnel.stage === 'Alterations') return 'alterations'
  return { issue: `to “${listAfter}” (only the designer’s Print Ready or Alterations are handled)` }
}
