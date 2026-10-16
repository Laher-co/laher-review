import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db, emails } from '@/lib/db'
import { recordIssue, tracked } from '@/lib/issues'

export const dynamic = 'force-dynamic'

/**
 * Resend calls this when an email bounces or is marked as spam. Each one
 * becomes an issue (they can't be retried automatically: the address or
 * content needs a person). Requests are verified with RESEND_WEBHOOK_SECRET
 * (Svix signing), so they can't be faked.
 */
export async function POST(request: Request) {
  const body = await request.text()
  if (!(await verifySvix(request.headers, body))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body) as {
    type: string
    data: { email_id?: string; to?: string[]; from?: string; subject?: string; bounce?: { message?: string; subType?: string } }
  }

  // A customer replied to one of our emails (to j<token>@reply.laher.co)
  if (event.type === 'email.received' && event.data.email_id) {
    await tracked('email_inbound', null, `Record an email reply from ${event.data.from ?? 'a customer'} (“${event.data.subject ?? ''}”)`,
      { type: 'inbound.process', args: { emailId: event.data.email_id } })
    return NextResponse.json({ ok: true })
  }
  if (event.type !== 'email.bounced' && event.type !== 'email.complained') return NextResponse.json({ ok: true, ignored: event.type })

  const [sent] = event.data.email_id
    ? await db.select({ jobId: emails.jobId }).from(emails).where(eq(emails.providerId, event.data.email_id)).limit(1)
    : []
  const to = (event.data.to ?? []).join(', ')
  const what = event.type === 'email.bounced' ? 'bounced' : 'was marked as spam'
  await recordIssue({
    kind: 'email_bounce',
    jobId: sent?.jobId ?? null,
    summary: `Email to ${to || 'unknown'} ${what}: “${event.data.subject ?? ''}”`,
    operation: null,
    error: event.data.bounce?.message ?? event.type,
  })
  if (event.data.email_id) {
    await db.update(emails).set({ status: 'failed', error: `${event.type}${event.data.bounce?.message ? `: ${event.data.bounce.message}` : ''}` })
      .where(eq(emails.providerId, event.data.email_id))
  }
  return NextResponse.json({ ok: true })
}

/** Svix webhook signature check: HMAC-SHA256 of "id.timestamp.body" with the whsec_ secret. */
async function verifySvix(headers: Headers, body: string) {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  const id = headers.get('svix-id'), timestamp = headers.get('svix-timestamp'), signatures = headers.get('svix-signature')
  if (!secret || !id || !timestamp || !signatures) return false
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false // reject replays

  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`)))
  const expected = btoa(String.fromCharCode(...mac))
  return signatures.split(' ').some(s => {
    const [version, sig] = s.split(',')
    if (version !== 'v1' || !sig || sig.length !== expected.length) return false
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
    return diff === 0
  })
}
