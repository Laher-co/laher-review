// Pure helpers for reading Trello data. No network calls, so they're unit tested.

export const STAGES = ['New Design Renders', 'Revision', 'Alterations', 'Print Ready'] as const
export type Stage = typeof STAGES[number]

/**
 * Reads a designer funnel list name such as "4.3 Heather | Revision" or
 * "Tara | Print Ready". Numbering is inconsistent (duplicates, trailing dots),
 * so everything before the designer name that's digits, dots or spaces is ignored.
 * Returns null for lists that aren't part of a designer funnel.
 */
export function parseDesignerList(name: string): { designer: string; stage: Stage } | null {
  const m = name.match(/^[\s\d.]*(.+?)\s*\|\s*(.+?)\s*$/)
  if (!m) return null
  const designer = m[1].trim()
  const stage = STAGES.find(s => s.toLowerCase() === m[2].toLowerCase().replace(/\s+/g, ' '))
  if (!designer || !stage) return null
  return { designer, stage }
}

/**
 * Finds the list for the same designer at the given stage.
 * Designer names are compared case-insensitively.
 */
export function findStageList<T extends { name: string }>(
  lists: T[], designer: string, stage: Stage,
): T | undefined {
  return lists.find(l => {
    const p = parseDesignerList(l.name)
    return p && p.stage === stage && p.designer.toLowerCase() === designer.toLowerCase()
  })
}

/**
 * Returns the text under a bold heading in a card description, e.g. the value
 * under "**Finger Size:**". Stops at the next bold heading or a "---" rule.
 */
export function descriptionSection(desc: string, heading: string): string | null {
  const lines = desc.split('\n')
  const want  = heading.toLowerCase()
  const start = lines.findIndex(l => l.replace(/\*/g, '').trim().replace(/:$/, '').toLowerCase() === want)
  if (start === -1) return null
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\s*\*\*.+\*\*\s*$/.test(line) || /^\s*---/.test(line)) break
    out.push(line)
  }
  // Trello escapes markdown ("1\.80mm") and inserts zero-width joiners
  const text = out.join('\n').replace(/\\(.)/g, '$1').replace(/[​-‍﻿]/g, '').trim()
  return text || null
}

export type RingSize = { size: string | null; status: 'unconfirmed' | 'confirmed'; note: string | null }

/**
 * Reads the finger size from a card description. A plain size counts as
 * confirmed; blank or anything mentioning TBC is unconfirmed (the original
 * text is kept as a note, e.g. "TBC (5-6US)").
 */
export function parseRingSize(desc: string): RingSize {
  const raw = descriptionSection(desc, 'Finger Size')
  if (!raw) return { size: null, status: 'unconfirmed', note: null }
  if (/\btbc\b|\bto be confirmed\b|\bunknown\b|^n\/?a$/i.test(raw)) {
    return { size: null, status: 'unconfirmed', note: raw }
  }
  return { size: raw.split('\n')[0].trim(), status: 'confirmed', note: null }
}

/** Accepts a Trello card URL, short link, or 24-character id. */
export function parseCardRef(input: string): string | null {
  const s = input.trim()
  const url = s.match(/trello\.com\/c\/([A-Za-z0-9]+)/)
  if (url) return url[1]
  if (/^[A-Za-z0-9]{8}$/.test(s) || /^[a-f0-9]{24}$/.test(s)) return s
  return null
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

/** Cards are usually named after the customer's email address. */
export function extractEmail(...sources: (string | null | undefined)[]): string | null {
  for (const s of sources) {
    const m = s?.match(EMAIL)
    if (m) return m[0].toLowerCase()
  }
  return null
}

/**
 * True only when the WHOLE card name is one email address (spaces trimmed,
 * any case). "john@example.com resize" or "Resize john@example.com" → false,
 * so resize/alteration cards never get a Studio link.
 */
export function isEmailOnlyName(name: string): boolean {
  return /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(name.trim())
}
