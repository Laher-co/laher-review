// Where an approval goes, what the card comment says, and what the customer can
// still do this round. Pure, so it's unit tested.

export type Flags = { stoneNotSecured: boolean; conceptRender: boolean; sideStonesUnconfirmed: boolean; oldSystem: boolean }
export type Hold = 'concept' | 'side_stones'

/**
 * Priority: stone not secured → REQUIRES SOURCING; otherwise a concept render
 * or unconfirmed side stones → the designer's Alterations; otherwise Print
 * Ready. A concept or side stones approval is "held" until it's done.
 */
export function approvalRoute(f: Flags): { to: 'sourcing' | 'alterations' | 'print_ready'; hold: Hold | null } {
  const hold: Hold | null = f.conceptRender ? 'concept' : f.sideStonesUnconfirmed ? 'side_stones' : null
  if (f.stoneNotSecured && !f.oldSystem) return { to: 'sourcing', hold }
  return { to: hold ? 'alterations' : 'print_ready', hold }
}

/** The bold first block of the Trello comment for an approval. */
export function approvalComment(f: Flags, what: string, designer: string): string[] {
  const route = approvalRoute(f)
  const open = [
    f.conceptRender ? 'concept render: build the full render and publish it for the customer’s final approval' : '',
    f.sideStonesUnconfirmed ? 'side stone sizes to be confirmed before casting' : '',
  ].filter(Boolean)
  if (route.to === 'sourcing') {
    return open.length
      ? [`**APPROVED${f.conceptRender ? ' CONCEPT' : ''}: ${what} – stone to be sourced.** Return to ${designer} | Alterations (not Print Ready) once the stone is added.`,
         `Also still open: ${open.join('; ')}.`]
      : [`**APPROVED: ${what} – stone to be sourced.** Return to ${designer} | Print Ready once the stone is added. No further renders to the customer.`]
  }
  if (f.conceptRender) {
    return [`**APPROVED CONCEPT: ${what} – build the full render and publish it for the customer’s final approval.**`,
      ...(f.sideStonesUnconfirmed ? ['Side stone sizes also to be confirmed before casting.'] : [])]
  }
  if (f.sideStonesUnconfirmed) {
    return [`**APPROVED: ${what} – side stone sizes to be confirmed before casting. Move to Print Ready once confirmed.**`]
  }
  return []
}

type DecisionLite = { decision: 'approved' | 'changes_requested'; concept?: boolean; createdAt: Date | string }
const t = (d: Date | string | null) => (d ? new Date(d).getTime() : 0)

/**
 * What the customer can do this round (since the last published version):
 * one change request per round, and nothing more once a full design is approved.
 */
export function roundState(publishedAt: (Date | string | null)[], decisions: DecisionLite[]):
  'open' | 'changes_sent' | 'approved' | 'concept_approved' {
  const lastPublish = Math.max(0, ...publishedAt.map(t))
  const latest = [...decisions].sort((a, b) => t(b.createdAt) - t(a.createdAt))[0]
  if (!latest || t(latest.createdAt) < lastPublish) return 'open'
  if (latest.decision === 'changes_requested') return 'changes_sent'
  return latest.concept ? 'concept_approved' : 'approved'
}
