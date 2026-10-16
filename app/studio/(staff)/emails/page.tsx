import {
  approvedSummary, changesSummary, designReminder, sizeReminder, staffReplied, versionReady, type EmailContent,
} from '@/lib/customer-email-templates'
import { EmailPreview } from './client'

export const metadata = { title: 'Email templates — LAHER Studio' }

// Sample data only: shows each customer email exactly as it's sent
const c = { firstName: 'Liam', designer: 'Heather', pageUrl: 'https://review.laher.co/r/example', ringSizeNeeded: false }
const sized = { ...c, ringSizeNeeded: true }

const TEMPLATES: { when: string; email: EmailContent }[] = [
  { when: 'Publish: first version (ring size unconfirmed, so it includes the size line)',
    email: versionReady({ ...sized, versionTitle: 'Version One', versionNumber: 1, optionCount: 2, note: 'Two directions for you: a yellow-gold cathedral setting and a platinum low bezel.' }) },
  { when: 'Publish: a later version',
    email: versionReady({ ...c, versionTitle: 'Version Two', versionNumber: 2, optionCount: 1, note: 'We’ve slimmed the band to 1.8mm and softened the shoulders.' }) },
  { when: 'Staff reply on the customer’s page',
    email: staffReplied({ ...c, staffName: 'Jane', body: 'Absolutely, we can do a hidden halo. Heather will include it in Version Two.' }) },
  { when: 'Summary after approving',
    email: approvedSummary({ ...c, what: 'Version Two, Option B', comments: 'Perfect, thank you!', sizeOutstanding: false }) },
  { when: 'Summary after approving with “Not sure of my size”',
    email: approvedSummary({ ...sized, what: 'Version Two, Option B', comments: null, sizeOutstanding: true }) },
  { when: 'Summary after requesting changes',
    email: changesSummary({ ...c, what: 'Version One, Option B', changes: ['Band: a little thinner, around 1.8mm', 'Metal: platinum instead'], comments: 'Love the overall shape!', drawings: 1 }) },
  { when: 'Reminder 1 (day 2, first quiet spell only)', email: designReminder({ ...c, n: 1 }) },
  { when: 'Reminder 2 (day 4)', email: designReminder({ ...c, n: 2 }) },
  { when: 'Reminder 3 (day 7), then REQUIRES CALL on day 8', email: designReminder({ ...c, n: 3 }) },
  { when: 'Ring size reminder 1 (day 2 after approving without a size)', email: sizeReminder({ ...sized, n: 1 }) },
  { when: 'Ring size reminder 2 (day 4)', email: sizeReminder({ ...sized, n: 2 }) },
  { when: 'Ring size reminder 3 (day 7), then REQUIRES CALL – SIZE on day 8', email: sizeReminder({ ...sized, n: 3 }) },
]

export default function EmailsPage() {
  return (
    <div>
      <h1 className="font-serif text-3xl text-cocoa-dark">Customer emails</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone">
        Every customer email, as sent from <strong>LAHER &lt;studio@laher.co&gt;</strong> with replies going to hello@leiedesign.com.
        None are sent when the Trello card is labelled “Do not email”.
      </p>
      <div className="mt-6 space-y-8">
        {TEMPLATES.map(t => <EmailPreview key={t.when} when={t.when} subject={t.email.subject} html={t.email.html} />)}
      </div>
    </div>
  )
}
