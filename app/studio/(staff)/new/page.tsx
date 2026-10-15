import { asc, eq } from 'drizzle-orm'
import { db, staff } from '@/lib/db'
import NewJobForm from './NewJobForm'

export const metadata = { title: 'New job — LAHER Studio' }

export default async function NewJobPage() {
  const designers = await db.select({ id: staff.id, name: staff.name })
    .from(staff).where(eq(staff.active, true)).orderBy(asc(staff.name))
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-serif text-3xl text-cocoa-dark">New job</h1>
      <p className="mt-2 text-sm text-stone">
        Paste the customer’s Trello card link. Details are pulled from the card for you to check.
      </p>
      <NewJobForm designers={designers} />
    </div>
  )
}
