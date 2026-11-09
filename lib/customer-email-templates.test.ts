import { describe, expect, it } from 'vitest'
import {
  approvedSummary, changesSummary, designReminder, laterVersionReminder, moreQuestionEmail, sizeReminder, staffReplied, versionReady, welcomeEmail,
} from './customer-email-templates'

const c = { firstName: 'Liam', designer: 'Heather', pageUrl: 'https://review.laher.co/r/abc', ringSizeNeeded: true, ringSizeHint: 'M', replyByEmail: true }

const all = [
  versionReady({ ...c, versionTitle: 'Version One', versionNumber: 1, optionCount: 2, note: 'Slimmer band <as asked>' }),
  versionReady({ ...c, versionTitle: 'Version Two', versionNumber: 2, optionCount: 1, note: null }),
  staffReplied({ ...c, staffName: 'Jane', body: 'Hi!' }),
  approvedSummary({ ...c, what: 'Version Two, Option B', comments: null, sizeOutstanding: false }),
  approvedSummary({ ...c, what: 'Version Two, Option B', comments: null, sizeOutstanding: true }),
  changesSummary({ ...c, what: 'Version One', changes: ['Band: thinner'], comments: 'Thanks', drawings: 1 }),
  designReminder({ ...c, n: 1 }), designReminder({ ...c, n: 2 }), designReminder({ ...c, n: 3 }),
  laterVersionReminder({ ...c, versionTitle: 'Version Two' }),
  sizeReminder({ ...c, n: 1 }), sizeReminder({ ...c, n: 2 }), sizeReminder({ ...c, n: 3 }),
]
const reminders = all.slice(6)

describe('customer emails', () => {
  it('are personal: first name and the designer’s name', () => {
    for (const e of all) {
      expect(e.text).toContain('Hi Liam,')
      expect(e.text).toContain('Heather')
    }
  })
  it('never sound urgent or final', () => {
    const banned = /\b(last|final)\b|don.t miss|deadline|urgent|asap|as soon as possible|hurry|expire|running out|before it.s too late|act now/i
    for (const e of all) {
      expect(e.subject).not.toMatch(banned)
      expect(e.text).not.toMatch(banned)
    }
  })
  it('have exactly one button, to their design page', () => {
    for (const e of all) {
      const buttons = e.html.match(/display:inline-block;background:#4A3022/g) ?? []
      expect(buttons.length).toBe(1)
      expect(e.html).toContain('href="https://review.laher.co/r/abc')
    }
  })
  it('invite replies by email when replies come back into the app', () => {
    expect(all[0].text).toContain('Simply reply to this email')
    expect(versionReady({ ...c, replyByEmail: false, versionTitle: 'Version One', versionNumber: 1, optionCount: 1, note: null }).text)
      .toContain('please leave a note on your design page')
  })
  it('include the gentle ring size line with the hint while unconfirmed', () => {
    expect(all[0].text).toContain('Please confirm your ring size whenever you’re ready (we’ve noted around M)')
    expect(versionReady({ ...c, ringSizeNeeded: false, versionTitle: 'Version One', versionNumber: 1, optionCount: 1, note: null }).text)
      .not.toContain('Please confirm your ring size')
  })
  it('escape customer and staff text', () => {
    expect(all[0].html).toContain('&lt;as asked&gt;')
    expect(all[0].html).not.toContain('<as asked>')
  })
  it('put "what happens next" after the list of changes', () => {
    const t = all[5].text
    expect(t.indexOf('Band: thinner')).toBeLessThan(t.indexOf('looking forward to working these'))
  })
})

describe('reminders are gentle check-ins', () => {
  it('say there’s no rush, or offer help', () => {
    for (const e of reminders) expect(e.text).toMatch(/no rush|whenever|take (all )?(the|your) time/i)
    for (const e of reminders) expect(e.text).toMatch(/message|help/i)
  })
  it('use different wording each time', () => {
    expect(new Set(reminders.map(e => e.subject)).size).toBe(reminders.length)
  })
})

describe('staff reply with photos', () => {
  it('mentions the photos, and works with photos only', () => {
    expect(staffReplied({ ...c, staffName: 'Jane', body: 'Here you go', photoCount: 2 }).text).toContain('Jane from the studio has replied to you and sent you 2 photos.')
    const only = staffReplied({ ...c, staffName: 'Jane', body: '', photoCount: 1 })
    expect(only.text).toContain('sent you a photo.')
    expect(only.text).not.toContain('Jane wrote')
  })
})

describe('concept renders', () => {
  it('the full design after a concept approval says "Your final design is ready"', () => {
    const e = versionReady({ ...c, versionTitle: 'Version Three', versionNumber: 3, optionCount: 1, note: null, final: true })
    expect(e.subject).toBe('Liam, your final design is ready')
    expect(e.html).toContain('Your final design is ready')
    expect((e.html.match(/display:inline-block;background:#4A3022/g) ?? []).length).toBe(1)
  })
  it('the approval email says what happens next', () => {
    expect(approvedSummary({ ...c, what: 'Version Two', comments: null, sizeOutstanding: false, next: 'full_design' }).text)
      .toContain('Heather will now build your full design, and we’ll share it with you for your final approval.')
    expect(approvedSummary({ ...c, what: 'Version Two', comments: null, sizeOutstanding: false, next: 'finalising' }).text)
      .toContain('Heather is now finalising your design')
  })
})

describe('onboarding emails', () => {
  const w = { ...c, welcomeUrl: 'https://review.laher.co/r/abc/welcome' }
  it('welcome: warm subject, one button to the welcome page, no ring size line', () => {
    const e = welcomeEmail({ ...w, hasDesigner: true })
    expect(e.subject).toBe('Welcome to LAHER Bespoke, Liam')
    expect(e.text).toContain('Thank you so much for choosing LAHER')
    expect(e.text).toContain('a few quick details will help us get your design just right')
    expect((e.html.match(/display:inline-block;background:#4A3022/g) ?? []).length).toBe(1)
    expect(e.html).toContain('href="https://review.laher.co/r/abc/welcome"')
    expect(e.text).not.toContain('Please confirm your ring size')
    expect(e.text).toContain('Heather & the LAHER studio')
  })
  it('signed by the studio when no designer is assigned yet', () => {
    const e = welcomeEmail({ ...w, designer: 'Your designer', hasDesigner: false })
    expect(e.text).toContain('With love,\nThe LAHER studio')
    expect(e.text).not.toContain('Your designer')
  })
  it('one more question', () => {
    const e = moreQuestionEmail({ ...w, hasDesigner: true })
    expect(e.subject).toBe('We have one more quick question about your design')
    expect(e.html).toContain('href="https://review.laher.co/r/abc/welcome"')
  })
  it('never sound urgent', () => {
    for (const e of [welcomeEmail({ ...w, hasDesigner: true }), moreQuestionEmail({ ...w, hasDesigner: false })]) {
      expect(e.text).not.toMatch(/\b(last|final)\b|deadline|urgent|asap|hurry/i)
    }
  })
})
