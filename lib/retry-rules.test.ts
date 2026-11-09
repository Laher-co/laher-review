import { describe, expect, it } from 'vitest'
import { afterFailedRetry, isTrelloOutage, MOVE_OPERATIONS } from './retry-rules'

const move = { type: 'trello.move', args: { cardId: 'c', stage: 'Alterations' } }

describe('isTrelloOutage', () => {
  it('is true for Trello 5xx errors', () => {
    expect(isTrelloOutage(move, 'Trello PUT /cards/abc failed (503): Service Unavailable')).toBe(true)
    expect(isTrelloOutage({ type: 'trello.comment', args: {} }, 'Trello POST /cards/x/actions/comments failed (502): ')).toBe(true)
  })
  it('is false for request problems and for other services', () => {
    expect(isTrelloOutage(move, 'Trello PUT /cards/abc failed (401): invalid token')).toBe(false)
    expect(isTrelloOutage(move, 'No "Tara | Alterations" list found')).toBe(false)
    expect(isTrelloOutage({ type: 'email.send', args: {} }, 'Resend failed (503)')).toBe(false)
    expect(isTrelloOutage(null, 'Trello GET /cards/x failed (503)')).toBe(false)
  })
})

describe('afterFailedRetry', () => {
  const now = new Date('2026-11-03T00:00:00Z')
  it('tries again 5 minutes later, up to 3 retries', () => {
    expect(afterFailedRetry(1, true, now)).toEqual({ status: 'retrying', nextRetryAt: new Date('2026-11-03T00:05:00Z') })
    expect(afterFailedRetry(2, true, now).status).toBe('retrying')
  })
  it('gives up after the third retry, or on a non-outage error', () => {
    expect(afterFailedRetry(3, true, now)).toEqual({ status: 'open', nextRetryAt: null })
    expect(afterFailedRetry(1, false, now).status).toBe('open')
  })
})

it('treats every card move as a move', () => {
  for (const t of ['trello.move', 'trello.labelAndMove', 'trello.toAlterations']) expect(MOVE_OPERATIONS.has(t)).toBe(true)
  expect(MOVE_OPERATIONS.has('trello.comment')).toBe(false)
})
