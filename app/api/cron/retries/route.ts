import { NextResponse } from 'next/server'
import { autoRetryIssues } from '@/lib/issues'

export const dynamic = 'force-dynamic'

// Vercel Cron, every 5 minutes: retries Trello outages (up to 3 times, about 15 minutes in all)
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }
  return NextResponse.json({ ok: true, retries: await autoRetryIssues() })
}
