import { describe, expect, it } from 'vitest'
import { addedToRequestComment, askIfChange, canMoveBackToRevision, canTreatAsChange, joinableChangeRequest, messageRoute } from './message-routing'

const pub = '2026-11-10T00:00:00Z'
const now = new Date('2026-11-11T00:00:00Z')
const cr = (at: string, extra: object = {}) => ({ id: 'd1', decision: 'changes_requested' as const, createdAt: at, ...extra })

describe('asking "Is this a change?"', () => {
  it('only in Revision, with the round open, and never on OLD SYSTEM cards', () => {
    expect(askIfChange({ stage: 'Revision', oldSystem: false }, 'open')).toBe(true)
    expect(askIfChange({ stage: 'Alterations', oldSystem: false }, 'open')).toBe(false)
    expect(askIfChange({ stage: 'Print Ready', oldSystem: false }, 'open')).toBe(false)
    expect(askIfChange({ stage: null, oldSystem: false }, 'open')).toBe(false)
    expect(askIfChange({ stage: 'Revision', oldSystem: true }, 'open')).toBe(false)
    expect(askIfChange({ stage: 'Revision', oldSystem: false }, 'changes_sent')).toBe(false)
    expect(askIfChange({ stage: 'Revision', oldSystem: false }, 'approved')).toBe(false)
    expect(askIfChange(null, 'open')).toBe(false)   // Trello unreachable: just a message
  })
})

describe('joining a change request', () => {
  it('within 24 hours, since the last version, not undone', () => {
    expect(joinableChangeRequest([pub], [cr('2026-11-10T06:00:00Z')], now)?.id).toBe('d1')
    expect(joinableChangeRequest([pub], [cr('2026-11-09T23:00:00Z')], now)).toBeNull()       // before the version
    expect(joinableChangeRequest([pub], [cr('2026-11-09T23:59:00Z')], new Date('2026-11-10T01:00:00Z'))).toBeNull()
    expect(joinableChangeRequest([pub], [cr('2026-11-10T00:00:00Z')], now)).toBeNull()        // exactly 24h later
    expect(joinableChangeRequest([pub], [cr('2026-11-10T06:00:00Z', { voidedAt: '2026-11-10T07:00:00Z' })], now)).toBeNull()
    expect(joinableChangeRequest([pub], [cr('2026-11-10T06:00:00Z'), { id: 'd2', decision: 'approved' as const, createdAt: '2026-11-10T08:00:00Z' }], now)).toBeNull()
  })
})

describe('routing a message', () => {
  const rev = { stage: 'Revision' as const, oldSystem: false }
  const alt = { stage: 'Alterations' as const, oldSystem: false }
  it('"Yes, it’s a change" in Revision → change request; "No" → message', () => {
    expect(messageRoute({ card: rev, round: 'open', intent: 'change', joinable: null })).toBe('change_request')
    expect(messageRoute({ card: rev, round: 'open', intent: 'question', joinable: null })).toBe('message')
    expect(messageRoute({ card: rev, round: 'open', intent: null, joinable: null })).toBe('message')
  })
  it('a "change" answer outside Revision is just a message (the card moved meanwhile)', () => {
    expect(messageRoute({ card: { stage: 'Print Ready', oldSystem: false }, round: 'open', intent: 'change', joinable: null })).toBe('message')
  })
  it('in Alterations with a recent change request → added to it', () => {
    expect(messageRoute({ card: alt, round: 'changes_sent', intent: null, joinable: { id: 'd1' } })).toBe('add_to_request')
    expect(messageRoute({ card: alt, round: 'changes_sent', intent: null, joinable: null })).toBe('message')
    expect(messageRoute({ card: { stage: 'Alterations', oldSystem: true }, round: 'changes_sent', intent: null, joinable: { id: 'd1' } })).toBe('message')
  })
})

describe('staff buttons', () => {
  const msg = { author: 'customer', cardList: '4.3 Heather | Revision', changeRequestId: null, createdAt: '2026-11-10T05:00:00Z' }
  it('Treat as change request: sent in Revision, not already part of one, no newer version', () => {
    expect(canTreatAsChange(msg, [pub], 'open')).toBe(true)
    expect(canTreatAsChange(msg, [pub], 'changes_sent')).toBe(true)
    expect(canTreatAsChange({ ...msg, cardList: 'Tara | Revision' }, [pub], 'open')).toBe(true)
    expect(canTreatAsChange({ ...msg, cardList: '4.4 Heather | Alterations' }, [pub], 'open')).toBe(false)
    expect(canTreatAsChange({ ...msg, cardList: null }, [pub], 'open')).toBe(false)
    expect(canTreatAsChange({ ...msg, changeRequestId: 'd1' }, [pub], 'open')).toBe(false)
    expect(canTreatAsChange({ ...msg, author: 'staff' }, [pub], 'open')).toBe(false)
    expect(canTreatAsChange(msg, [pub, '2026-11-10T06:00:00Z'], 'open')).toBe(false)
    expect(canTreatAsChange(msg, [pub], 'approved')).toBe(false)
  })
  it('Move back to Revision: the latest decision, made from a message, before a new version', () => {
    const d = { id: 'd1', fromMessageId: 'm1', voidedAt: null, createdAt: '2026-11-10T05:00:00Z' }
    const all = [{ ...d, decision: 'changes_requested' as const }]
    expect(canMoveBackToRevision(d, [pub], all)).toBe(true)
    expect(canMoveBackToRevision({ ...d, fromMessageId: null }, [pub], all)).toBe(false)
    expect(canMoveBackToRevision({ ...d, voidedAt: '2026-11-10T06:00:00Z' }, [pub], all)).toBe(false)
    expect(canMoveBackToRevision(d, [pub, '2026-11-10T06:00:00Z'], all)).toBe(false)
    expect(canMoveBackToRevision(d, [pub], [...all, { id: 'd2', decision: 'approved' as const, createdAt: '2026-11-10T07:00:00Z' }])).toBe(false)
  })
})

it('Trello comment for an added message', () => {
  expect(addedToRequestComment('Version One', 'Also a thinner band', ['(1 photo: see LAHER Studio)']))
    .toBe('**ADDED TO CHANGE REQUEST: Version One**\n\nAlso a thinner band\n\n(1 photo: see LAHER Studio)')
})
