import Link from 'next/link'
import { eq, sql } from 'drizzle-orm'
import { db, issues } from '@/lib/db'
import { requireStaff } from '@/lib/auth'
import { Wordmark } from '@/components/brand'
import { signOut } from '../actions'

export const dynamic = 'force-dynamic'

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff()
  const [{ open }] = await db.select({ open: sql<number>`count(*)::int` }).from(issues).where(eq(issues.status, 'open'))
  return (
    <div className="min-h-screen bg-ivory font-inter text-ink">
      <header className="sticky top-0 z-20 border-b border-sand bg-ivory/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
          <Wordmark href="/studio" />
          <span className="hidden text-[11px] uppercase tracking-[0.25em] text-stone sm:inline">Studio</span>
          <nav className="ml-auto flex items-center gap-1 text-sm">
            <Link href="/studio" className="rounded-md px-3 py-2 text-cocoa-light hover:bg-linen hover:text-cocoa">Jobs</Link>
            <Link href="/studio/issues" className="flex items-center gap-1.5 rounded-md px-3 py-2 text-cocoa-light hover:bg-linen hover:text-cocoa">
              Issues
              {open > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-5 text-white">{open}</span>}
            </Link>
            <Link href="/studio/emails" className="hidden rounded-md px-3 py-2 text-cocoa-light hover:bg-linen hover:text-cocoa md:inline">Emails</Link>
            <Link href="/studio/settings" className="hidden rounded-md px-3 py-2 text-cocoa-light hover:bg-linen hover:text-cocoa sm:inline">Settings</Link>
            <Link href="/studio/new" className="rounded-md bg-cocoa px-3 py-2 text-ivory hover:bg-cocoa-dark">New job</Link>
          </nav>
          <form action={signOut} className="flex items-center gap-2 border-l border-sand pl-3">
            <span className="hidden text-sm text-stone sm:inline">{session.name}</span>
            <button className="text-xs text-stone underline-offset-2 hover:text-cocoa hover:underline">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}
