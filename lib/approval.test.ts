import { describe, expect, it } from 'vitest'
import { approvalComment, approvalRoute, roundState, sizeReleasesToPrintReady } from './approval'

const none = { stoneNotSecured: false, conceptRender: false, sideStonesUnconfirmed: false, oldSystem: false }
const what = 'Version Two, Option B'

describe('approvalRoute (flag priority)', () => {
  it('stone not secured wins: REQUIRES SOURCING', () => {
    expect(approvalRoute({ ...none, stoneNotSecured: true, conceptRender: true })).toEqual({ to: 'sourcing', hold: 'concept' })
  })
  it('then concept or side stones: Alterations, held', () => {
    expect(approvalRoute({ ...none, conceptRender: true })).toEqual({ to: 'alterations', hold: 'concept' })
    expect(approvalRoute({ ...none, sideStonesUnconfirmed: true })).toEqual({ to: 'alterations', hold: 'side_stones' })
    expect(approvalRoute({ ...none, conceptRender: true, sideStonesUnconfirmed: true }).hold).toBe('concept')
  })
  it('otherwise Print Ready; OLD SYSTEM cards never go to sourcing', () => {
    expect(approvalRoute(none)).toEqual({ to: 'print_ready', hold: null })
    // Not sure of their size: the card stays put unless another flag sends it somewhere
    expect(approvalRoute({ ...none, sizeOutstanding: true })).toEqual({ to: 'stay', hold: null })
    expect(approvalRoute({ ...none, sizeOutstanding: true, sideStonesUnconfirmed: true })).toEqual({ to: 'alterations', hold: 'side_stones' })
    expect(approvalRoute({ ...none, sizeOutstanding: true, stoneNotSecured: true })).toEqual({ to: 'sourcing', hold: null })
    expect(approvalRoute({ ...none, stoneNotSecured: true, oldSystem: true })).toEqual({ to: 'print_ready', hold: null })
  })
})

describe('approvalComment', () => {
  it('uses the agreed wording', () => {
    expect(approvalComment({ ...none, sideStonesUnconfirmed: true }, what, 'Heather')).toEqual([
      '**APPROVED: Version Two, Option B – side stone sizes to be confirmed before casting. Move to Print Ready once confirmed.**'])
    expect(approvalComment({ ...none, conceptRender: true }, what, 'Heather')).toEqual([
      '**APPROVED CONCEPT: Version Two, Option B – build the full render and publish it for the customer’s final approval.**'])
    expect(approvalComment({ ...none, stoneNotSecured: true }, what, 'Heather')[0]).toBe(
      '**APPROVED: Version Two, Option B – stone to be sourced.** Return to Heather | Print Ready once the stone is added. No further renders to the customer.')
  })
  it('with the stone and other open items, sends it back to Alterations after sourcing', () => {
    const c = approvalComment({ ...none, stoneNotSecured: true, sideStonesUnconfirmed: true }, what, 'Heather')
    expect(c[0]).toContain('Return to Heather | Alterations (not Print Ready) once the stone is added.')
    expect(c[1]).toBe('Also still open: side stone sizes to be confirmed before casting.')
  })
  it('is empty for a plain approval (the usual heading is used)', () => {
    expect(approvalComment(none, what, 'Heather')).toEqual([])
  })
})

describe('roundState', () => {
  const v1 = '2026-11-01T00:00:00Z', v2 = '2026-11-05T00:00:00Z'
  it('one change request per round', () => {
    expect(roundState([v1], [{ decision: 'changes_requested', createdAt: '2026-11-02T00:00:00Z' }])).toBe('changes_sent')
    expect(roundState([v1, v2], [{ decision: 'changes_requested', createdAt: '2026-11-02T00:00:00Z' }])).toBe('open')
  })
  it('approved full design locks; concept approval is its own state', () => {
    expect(roundState([v1], [{ decision: 'approved', createdAt: '2026-11-02T00:00:00Z' }])).toBe('approved')
    expect(roundState([v1], [{ decision: 'approved', concept: true, createdAt: '2026-11-02T00:00:00Z' }])).toBe('concept_approved')
    expect(roundState([v1, v2], [{ decision: 'approved', concept: true, createdAt: '2026-11-02T00:00:00Z' }])).toBe('open')
    expect(roundState([v1], [])).toBe('open')
  })
})

describe('sizeReleasesToPrintReady', () => {
  it('moves only an approval that was waiting on the size alone', () => {
    expect(sizeReleasesToPrintReady({ status: 'approved_size_needed', approvedHold: null, sourcing: null })).toBe(true)
    expect(sizeReleasesToPrintReady({ status: 'approved_size_needed', approvedHold: 'side_stones', sourcing: null })).toBe(false)
    expect(sizeReleasesToPrintReady({ status: 'approved_size_needed', approvedHold: 'concept', sourcing: null })).toBe(false)
    expect(sizeReleasesToPrintReady({ status: 'approved_size_needed', approvedHold: null, sourcing: 'approved' })).toBe(false)
    expect(sizeReleasesToPrintReady({ status: 'in_review', approvedHold: null, sourcing: null })).toBe(false)
  })
})
