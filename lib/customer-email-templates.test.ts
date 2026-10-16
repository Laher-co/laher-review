import { describe, expect, it } from 'vitest'
import { approvedSummary, changesSummary, designReminder, sizeReminder, staffReplied, versionReady } from './customer-email-templates'

const c = { firstName: 'Liam', designer: 'Heather', pageUrl: 'https://review.laher.co/r/abc', ringSizeNeeded: true }

describe('customer email templates', () => {
  const all = [
    versionReady({ ...c, versionTitle: 'Version Two', versionNumber: 2, optionCount: 2, note: 'Slimmer band <as asked>' }),
    staffReplied({ ...c, staffName: 'Jane', body: 'Hi!' }),
    approvedSummary({ ...c, what: 'Version Two, Option B', comments: null, sizeOutstanding: true }),
    changesSummary({ ...c, what: 'Version One', changes: ['Band: thinner'], comments: 'Thanks', drawings: 1 }),
    designReminder({ ...c, n: 1 }), designReminder({ ...c, n: 3 }),
  ]
  it('every email says to reply on the page, not by email', () => {
    for (const e of [...all, sizeReminder({ ...c, n: 2 })]) {
      expect(e.text).toContain('reply on your design page rather than by email')
      expect(e.html).toContain(c.pageUrl)
    }
  })
  it('adds the ring size line while the size is unconfirmed', () => {
    for (const e of all) expect(e.text).toContain('Please confirm your ring size')
    expect(versionReady({ ...c, ringSizeNeeded: false, versionTitle: 'Version One', versionNumber: 1, optionCount: 1, note: null }).text)
      .not.toContain('Please confirm your ring size')
  })
  it('escapes customer and staff text', () => {
    expect(all[0].html).toContain('&lt;as asked&gt;')
    expect(all[0].html).not.toContain('<as asked>')
  })
  it('puts "what happens next" after the list of changes', () => {
    const t = all[3].text
    expect(t.indexOf('Band: thinner')).toBeLessThan(t.indexOf('What happens next'))
  })
})
