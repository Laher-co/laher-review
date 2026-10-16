import { asc, eq } from 'drizzle-orm'
import { db, staff } from '@/lib/db'
import NewJobForm from './NewJobForm'

export const metadata = { title: 'New job — LAHER Studio' }

export default async function NewJobPage({ searchParams }: { searchParams: { card?: string; error?: string } }) {
  const designers = await db.select({ id: staff.id, name: staff.name })
    .from(staff).where(eq(staff.active, true)).orderBy(asc(staff.name))
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-serif text-3xl text-cocoa-dark">New job</h1>
      <p className="mt-2 text-sm text-stone">
        Paste the customer’s Trello card link. Details are pulled from the card for you to check.
      </p>
      {searchParams.error && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {searchParams.error === 'card-not-found'
            ? 'That Trello card couldn’t be found. It may have been archived or deleted.'
            : 'The card couldn’t be opened automatically (logged in Issues). Check its details below.'}
        </p>
      )}
      <NewJobForm designers={designers} initialCard={searchParams.card ? `https://trello.com/c/${searchParams.card}` : ''} />
    </div>
  )
}
