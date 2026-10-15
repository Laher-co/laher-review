import { asc, eq } from 'drizzle-orm'
import { db, staff } from '@/lib/db'
import { Wordmark } from '@/components/brand'
import LoginForm from './LoginForm'

export const metadata = { title: 'Staff sign in — LAHER' }
export const dynamic = 'force-dynamic'

export default async function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const people = await db.select({ id: staff.id, name: staff.name })
    .from(staff).where(eq(staff.active, true)).orderBy(asc(staff.name))

  return (
    <main className="min-h-screen bg-ivory font-inter flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <Wordmark />
          <p className="mt-2 text-xs uppercase tracking-[0.25em] text-stone">Studio</p>
        </div>
        <LoginForm people={people} next={searchParams.next ?? '/studio'} />
      </div>
    </main>
  )
}
