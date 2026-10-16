import { sampleEmails } from '@/lib/customer-email-samples'
import { repliesComeBack } from '@/lib/customer-emails'
import { EmailPreview } from './client'

export const metadata = { title: 'Email templates — LAHER Studio' }

export default function EmailsPage() {
  const replies = repliesComeBack()
  return (
    <div>
      <h1 className="font-serif text-3xl text-cocoa-dark">Customer emails</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone">
        Every customer email, as sent from <strong>LAHER &lt;studio@laher.co&gt;</strong>.{' '}
        {replies
          ? 'Customers can reply to any of them: replies land in the job’s messages and Jane’s queue, and stop reminders.'
          : 'Replies go to hello@leiedesign.com.'}{' '}
        None are sent when “Do not email” is on (the Studio switch or the Trello label).
      </p>
      <div className="mt-6 space-y-8">
        {sampleEmails(replies).map(t => <EmailPreview key={t.when} when={t.when} subject={t.email.subject} html={t.email.html} />)}
      </div>
    </div>
  )
}
