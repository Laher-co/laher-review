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
