import { asc, eq } from 'drizzle-orm'
import { db, staff } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { DesignerToggle } from './client'

export const metadata = { title: 'Settings — LAHER Studio' }

export default async function SettingsPage() {
  const session = await requireStaff()
  const people = await db.select().from(staff).orderBy(asc(staff.name))
  const isOwner = people.find(p => p.id === session.staffId)?.role === 'owner'
  const designers = people.filter(p => p.role === 'designer' && p.active)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-3xl text-cocoa-dark">Settings</h1>

      <section className="mt-8 rounded-2xl border border-sand bg-white/70 p-5 sm:p-6">
        <h2 className="font-serif text-xl text-cocoa-dark">Designers on LAHER Studio</h2>
        <p className="mt-1 text-sm text-stone">
          For designers switched on, new cards in their <strong>New Design Renders</strong> list get an
          “Open in LAHER Studio” link, but only if the card’s name is just the customer’s email. Switching
          someone on also adds links to the cards already in that list. Revision and Alterations stay on the old system.
        </p>
        {!isOwner && <p className="mt-3 text-sm text-amber-800">Only Ryan can change these.</p>}
        <ul className="mt-5 divide-y divide-sand">
          {designers.map(d => (
            <li key={d.id} className="py-3">
              <DesignerToggle staffId={d.id} name={d.name} on={d.onStudio} canEdit={isOwner} />
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-2xl border border-sand bg-white/70 p-5 text-sm text-stone sm:p-6">
        <h2 className="font-serif text-xl text-cocoa-dark">Staff</h2>
        <ul className="mt-3 space-y-1">
          {people.filter(p => p.active).map(p => (
            <li key={p.id}><span className="text-ink">{p.name}</span> · {p.role === 'va' ? 'VA' : p.role === 'escalations' ? 'Escalations' : p.role === 'owner' ? 'Owner' : 'Designer'}{p.email ? ` · ${p.email}` : ''}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
