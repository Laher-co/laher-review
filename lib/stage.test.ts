import { describe, expect, it } from 'vitest'
import { jobStage } from './stage'

const d = (decision: 'approved' | 'changes_requested', createdAt: string, sizeOutstanding = false) =>
  ({ decision, createdAt, sizeOutstanding })

describe('jobStage', () => {
  it('is in design before anything is published', () => {
    expect(jobStage({ publishedAt: [null], decisions: [], ringSizeStatus: 'unconfirmed' })).toBe('in_design')
  })
  it('needs feedback once a version is published', () => {
    expect(jobStage({ publishedAt: ['2026-10-01'], decisions: [], ringSizeStatus: 'confirmed' })).toBe('feedback_needed')
  })
  it('shows alterations after a change request', () => {
    expect(jobStage({ publishedAt: ['2026-10-01'], decisions: [d('changes_requested', '2026-10-02')], ringSizeStatus: 'confirmed' }))
      .toBe('alterations')
  })
  it('needs feedback again when the next version is published', () => {
    expect(jobStage({
      publishedAt: ['2026-10-01', '2026-10-05'],
      decisions: [d('changes_requested', '2026-10-02')],
      ringSizeStatus: 'confirmed',
    })).toBe('feedback_needed')
  })
  it('uses the latest response, e.g. approving an older version after a newer one was published', () => {
    expect(jobStage({
      publishedAt: ['2026-10-01', '2026-10-05'],
      decisions: [d('changes_requested', '2026-10-02'), d('approved', '2026-10-06')],
      ringSizeStatus: 'confirmed',
    })).toBe('approved')
  })
  it('asks for the ring size when approved without one', () => {
    expect(jobStage({ publishedAt: ['2026-10-01'], decisions: [d('approved', '2026-10-02', true)], ringSizeStatus: 'unconfirmed' }))
      .toBe('approved_size_needed')
  })
  it('stops asking once the customer has sent a size', () => {
    expect(jobStage({ publishedAt: ['2026-10-01'], decisions: [d('approved', '2026-10-02', true)], ringSizeStatus: 'submitted' }))
      .toBe('approved')
  })
  it('a change request after approving moves back to alterations', () => {
    expect(jobStage({
      publishedAt: ['2026-10-01'],
      decisions: [d('approved', '2026-10-02'), d('changes_requested', '2026-10-03')],
      ringSizeStatus: 'confirmed',
    })).toBe('alterations')
  })
})

describe('REQUIRES SOURCING', () => {
  const published = [new Date('2026-11-01T00:00:00Z')]
  const approved = [{ decision: 'approved' as const, sizeOutstanding: false, createdAt: new Date('2026-11-02T00:00:00Z') }]
  const changes = [{ decision: 'changes_requested' as const, sizeOutstanding: false, createdAt: new Date('2026-11-02T00:00:00Z') }]
  it('shows the sourcing banners while the card is there', () => {
    expect(jobStage({ publishedAt: published, decisions: approved, ringSizeStatus: 'confirmed', sourcing: 'approved' })).toBe('sourcing_approved')
    expect(jobStage({ publishedAt: published, decisions: changes, ringSizeStatus: 'confirmed', sourcing: 'new_stone' })).toBe('sourcing_new_stone')
  })
  it('moved out to Print Ready: approved, even without a customer approval', () => {
    expect(jobStage({ publishedAt: published, decisions: [], ringSizeStatus: 'confirmed', overrides: [{ stage: 'approved', at: '2026-11-03T00:00:00Z' }] })).toBe('approved')
  })
  it('moved out to Alterations: alterations, until the next version is published', () => {
    const o = [{ stage: 'alterations' as const, at: '2026-11-03T00:00:00Z' }]
    expect(jobStage({ publishedAt: published, decisions: approved, ringSizeStatus: 'confirmed', overrides: o })).toBe('alterations')
    expect(jobStage({ publishedAt: [...published, new Date('2026-11-04T00:00:00Z')], decisions: approved, ringSizeStatus: 'confirmed', overrides: o })).toBe('feedback_needed')
  })
})
