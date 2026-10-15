import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from './lib/session'

// Staff-only areas. The customer page (/r/…) and the legacy review page (/)
// stay public.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === '/studio/login') return NextResponse.next()

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (session) return NextResponse.next()

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }
  const login = new URL('/studio/login', req.url)
  login.searchParams.set('next', pathname)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/studio/:path*', '/api/staff/:path*'],
}
