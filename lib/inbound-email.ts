import 'server-only'
import { eq } from 'drizzle-orm'
import { put } from '@vercel/blob'
import { db, jobs, staff, type MessageAttachment } from './db'
import { logEvent } from './events'
import { recordCustomerMessage } from './customer-message'
import { htmlToText, isAutoReply, stripQuotedReply, tokenFromAddress } from './email-reply'

const resend = async <T>(path: string): Promise<T> => {
  const r = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` }, cache: 'no-store',
  })
  if (!r.ok) throw new Error(`Resend ${path.split('?')[0]} → ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.json() as Promise<T>
}

type Received = {
  id: string; from: string; to: string[]; subject: string
  text: string | null; html: string | null; headers?: Record<string, string>
}

/**
 * A customer replied to one of our emails. Finds the job from the reply
 * address, keeps only what they just wrote, saves any attachments, and
 * records it like a message on their page. Throws on failure, so the caller
 * can log an issue whose Retry runs this again (safe: one message per email).
 */
export async function processInboundEmail(emailId: string) {
  const email = await resend<Received>(`/emails/receiving/${emailId}`)
  const token = email.to.map(tokenFromAddress).find(Boolean)
  if (!token) throw new Error(`Not addressed to a job reply address (${email.to.join(', ')})`)
  const [row] = await db.select({ job: jobs, designer: staff.name })
    .from(jobs).leftJoin(staff, eq(staff.id, jobs.designerId)).where(eq(jobs.replyToken, token))
  if (!row) throw new Error(`No job uses the reply address j${token}@reply.laher.co`)

  if (isAutoReply(email.subject ?? '', email.headers)) {
    await logEvent(row.job.id, null, 'auto_reply_ignored', { from: email.from, subject: email.subject })
    return { action: 'ignored', reason: 'automatic reply' }
  }

  const body = stripQuotedReply(email.text ?? htmlToText(email.html ?? '')).slice(0, 4000)

  // Attachments (skipping small inline images such as signature logos)
  const attachments: MessageAttachment[] = []
  const list = await resend<{ data: { id: string; filename: string; size: number; content_type: string; content_disposition: string; download_url: string }[] }>(
    `/emails/receiving/${emailId}/attachments`)
  for (const a of list.data.slice(0, 10)) {
    if (a.content_disposition === 'inline' && a.size < 30_000) continue
    if (a.size > 15 * 1024 * 1024) continue
    const file = await fetch(a.download_url)
    if (!file.ok) throw new Error(`Couldn’t download attachment ${a.filename}`)
    const blob = await put(`email-attachments/${row.job.id}/${a.filename.replace(/[^\w.-]+/g, '-')}`, await file.arrayBuffer(),
      { access: 'public', addRandomSuffix: true, contentType: a.content_type })
    attachments.push({ url: blob.url, name: a.filename, contentType: a.content_type, size: a.size })
  }

  const msg = await recordCustomerMessage(row.job, row.designer, {
    version: null, body: body || (attachments.length ? '' : '(empty reply)'), attachments,
    source: 'email', emailFrom: email.from, clientKey: `email:${emailId}`,
  })
  return msg ? { action: 'recorded', messageId: msg.id } : { action: 'duplicate' }
}
