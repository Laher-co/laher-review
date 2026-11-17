// Customer messages and change requests. Pure rules (no I/O), unit tested.
//
// - Card in Revision, round open: the customer is asked "Is this a change you'd
//   like to your design?" before the message goes. "Yes" makes it a change
//   request (card to Alterations); "No" is a normal message (card stays).
// - Card in Alterations within 24 hours of a change request (and before the
//   next version): the message is added to that change request.
// - Anything else: a normal message. Messages never move the card otherwise.

export type CardStage = 'New Design Renders' | 'Revision' | 'Alterations' | 'Print Ready'
export type Round = 'open' | 'changes_sent' | 'approved' | 'concept_approved'
export type DecisionForRouting = {
  id: string
  decision: 'approved' | 'changes_requested'
  createdAt: Date | string
  voidedAt?: Date | string | null
}

export const ADD_TO_REQUEST_WINDOW_MS = 24 * 3600_000

const t = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : 0)

/** Decisions that still count (a change request moved back to Revision doesn't). */
export const liveDecisions = <T extends { voidedAt?: Date | string | null }>(ds: T[]) => ds.filter(d => !d.voidedAt)

/** Show "Is this a change you'd like to your design?" before sending. */
export function askIfChange(card: { stage: CardStage | null; oldSystem: boolean } | null, round: Round) {
  return !!card && !card.oldSystem && card.stage === 'Revision' && round === 'open'
}

/**
 * The change request a new message joins: the latest decision is a change
 * request (not undone), made since the last version was published and less
 * than 24 hours ago. Null otherwise.
 */
export function joinableChangeRequest<T extends DecisionForRouting>(publishedAt: (Date | string | null)[], decisions: T[], now = new Date()): T | null {
  const lastPublish = Math.max(0, ...publishedAt.map(t))
  const latest = [...liveDecisions(decisions)].sort((a, b) => t(b.createdAt) - t(a.createdAt))[0]
  if (!latest || latest.decision !== 'changes_requested') return null
  if (t(latest.createdAt) < lastPublish) return null
  if (now.getTime() - t(latest.createdAt) >= ADD_TO_REQUEST_WINDOW_MS) return null
  return latest
}

export type MessageRoute = 'change_request' | 'add_to_request' | 'message'

/** What happens to a message the customer is sending. */
export function messageRoute(i: {
  card: { stage: CardStage | null; oldSystem: boolean } | null
  round: Round
  intent: 'change' | 'question' | null
  joinable: unknown | null
}): MessageRoute {
  if (i.intent === 'change' && askIfChange(i.card, i.round)) return 'change_request'
  if (i.card && !i.card.oldSystem && i.card.stage === 'Alterations' && i.joinable) return 'add_to_request'
  return 'message'
}

/** "Move back to Revision (just a question)": only the latest decision, made from a message, before a new version. */
export function canMoveBackToRevision(d: { id: string; fromMessageId: string | null; voidedAt: Date | string | null; createdAt: Date | string },
  publishedAt: (Date | string | null)[], decisions: DecisionForRouting[]) {
  if (!d.fromMessageId || d.voidedAt) return false
  const lastPublish = Math.max(0, ...publishedAt.map(t))
  if (t(d.createdAt) < lastPublish) return false
  const latest = [...liveDecisions(decisions)].sort((a, b) => t(b.createdAt) - t(a.createdAt))[0]
  return latest?.id === d.id
}

/**
 * "Treat as change request": a customer message sent while the card was in
 * Revision, not already part of a change request, and no newer version since.
 * The round must still allow changes (open, or a change request to add it to).
 */
export function canTreatAsChange(m: { author: string; cardList: string | null; changeRequestId: string | null; createdAt: Date | string },
  publishedAt: (Date | string | null)[], round: Round) {
  if (m.author !== 'customer' || m.changeRequestId) return false
  if (!m.cardList || !/\|\s*Revision\s*$/i.test(m.cardList)) return false
  const lastPublish = Math.max(0, ...publishedAt.map(t))
  if (lastPublish === 0 || t(m.createdAt) < lastPublish) return false
  return round === 'open' || round === 'changes_sent'
}

/** Trello comment for a message added to a change request. */
export function addedToRequestComment(where: string, body: string, extras: string[]) {
  return [`**ADDED TO CHANGE REQUEST: ${where}**`, body, ...extras].filter(Boolean).join('\n\n')
}
