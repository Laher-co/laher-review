import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySession, type StaffSession } from './session'

/** For staff pages and server actions. Middleware also guards /studio. */
export async function requireStaff(): Promise<StaffSession> {
  const session = await verifySession(cookies().get(SESSION_COOKIE)?.value)
  if (!session) redirect('/studio/login')
  return session
}

/** Constant-time check of the shared staff password. */
export function checkStaffPassword(input: string): boolean {
  const expected = process.env.STAFF_PASSWORD
  if (!expected) throw new Error('STAFF_PASSWORD is not set.')
  const a = new TextEncoder().encode(input), b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}
