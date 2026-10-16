// Sample data for every customer email: used by the Studio "Customer emails"
// page and for sending test copies, so both show exactly what's sent.
import {
  approvedSummary, changesSummary, designReminder, laterVersionReminder, sizeReminder, staffReplied, versionReady, type EmailContent,
} from './customer-email-templates'

export function sampleEmails(replyByEmail: boolean, pageUrl = 'https://review.laher.co/r/example'): { when: string; email: EmailContent }[] {
  const c = { firstName: 'Liam', designer: 'Heather', pageUrl, ringSizeNeeded: false, replyByEmail }
  const sized = { ...c, ringSizeNeeded: true, ringSizeHint: 'M' }
  return [
    { when: 'Publish: Version One (ring size unconfirmed, so it includes the gentle size line)',
      email: versionReady({ ...sized, versionTitle: 'Version One', versionNumber: 1, optionCount: 2, note: 'Two directions for you: a yellow-gold cathedral setting and a platinum low bezel.' }) },
    { when: 'Publish: Version Two onwards',
      email: versionReady({ ...c, versionTitle: 'Version Two', versionNumber: 2, optionCount: 1, note: 'We’ve slimmed the band to 1.8mm and softened the shoulders.' }) },
    { when: 'Staff reply',
      email: staffReplied({ ...c, staffName: 'Jane', body: 'Absolutely, we can do a hidden halo. Heather will include it in Version Two.' }) },
    { when: 'Summary after approving',
      email: approvedSummary({ ...c, what: 'Version Two, Option B', comments: 'Perfect, thank you!', sizeOutstanding: false }) },
    { when: 'Summary after approving with “Not sure of my size”',
      email: approvedSummary({ ...sized, what: 'Version Two, Option B', comments: null, sizeOutstanding: true }) },
    { when: 'Summary after requesting changes',
      email: changesSummary({ ...c, what: 'Version One, Option B', changes: ['Band: a little thinner, around 1.8mm', 'Metal: platinum instead'], comments: 'Love the overall shape!', drawings: 1 }) },
    { when: 'Version One check-in 1 (day 2)', email: designReminder({ ...c, n: 1 }) },
    { when: 'Version One check-in 2 (day 4)', email: designReminder({ ...c, n: 2 }) },
    { when: 'Version One check-in 3 (day 7), then REQUIRES CALL for Jane on day 8', email: designReminder({ ...c, n: 3 }) },
    { when: 'Version Two onwards: one reminder (day 2), then FOLLOW UP for Jane on day 4', email: laterVersionReminder({ ...c, versionTitle: 'Version Two' }) },
    { when: 'Ring size reminder 1 (day 2 after approving without a size)', email: sizeReminder({ ...sized, n: 1 }) },
    { when: 'Ring size reminder 2 (day 4)', email: sizeReminder({ ...sized, n: 2 }) },
    { when: 'Ring size reminder 3 (day 7), then REQUIRES CALL – SIZE on day 8', email: sizeReminder({ ...sized, n: 3 }) },
  ]
}
