import 'server-only'
import { inArray } from 'drizzle-orm'
import { db, emails, staff } from './db'

// Until laher.co is verified in Resend, only Resend's test sender works (and
// it only delivers to the Resend account owner). Set EMAIL_FROM once verified.
const FROM = process.env.EMAIL_FROM ?? 'LAHER Studio <onboarding@resend.dev>'

export type EmailMessage = {
  to: string | string[]
  subject: string
  html: string
  text: string
  type: string            // e.g. 'issue_alert', 'issue_digest', 'escalation'
  jobId?: string | null
  replyTo?: string
}

/**
 * Sends through Resend and logs every attempt in the emails table.
 * Throws on failure so callers (usually lib/issues) can record an issue.
 */
export async function sendEmail(m: EmailMessage): Promise<string> {
  const to = [...new Set(Array.isArray(m.to) ? m.to : [m.to])].filter(Boolean)
  if (to.length === 0) throw new Error('No recipients for this email.')
  const key = process.env.RESEND_API_KEY
  try {
    if (!key) throw new Error('RESEND_API_KEY is not set.')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to, subject: m.subject, html: m.html, text: m.text, reply_to: m.replyTo }),
      cache: 'no-store',
    })
    const body = await res.json().catch(() => ({})) as { id?: string; message?: string }
    if (!res.ok || !body.id) throw new Error(`Resend ${res.status}: ${body.message ?? 'unknown error'}`)
    await db.insert(emails).values(to.map(addr => ({ jobId: m.jobId ?? null, to: addr, type: m.type, status: 'sent' as const, providerId: body.id })))
    return body.id
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await db.insert(emails).values(to.map(addr => ({ jobId: m.jobId ?? null, to: addr, type: m.type, status: 'failed' as const, error })))
    throw err
  }
}

/** Email addresses for staff with these roles (deduplicated). */
export async function staffEmails(roles: ('designer' | 'va' | 'escalations' | 'owner')[]) {
  const rows = await db.select({ email: staff.email }).from(staff).where(inArray(staff.role, roles))
  return [...new Set(rows.map(r => r.email).filter((e): e is string => !!e))]
}

/** Minimal branded wrapper for staff emails. */
export function staffEmailHtml(title: string, bodyHtml: string, link?: { href: string; label: string }) {
  return `<!doctype html><html><body style="margin:0;background:#F8F4EE;font-family:Helvetica,Arial,sans-serif;color:#2B211B">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<p style="font-family:Georgia,serif;letter-spacing:.3em;color:#36231A;margin:0 0 20px">LAHER</p>
<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;color:#36231A;margin:0 0 12px">${title}</h1>
<div style="font-size:15px;line-height:1.55">${bodyHtml}</div>
${link ? `<p style="margin:24px 0 0"><a href="${link.href}" style="display:inline-block;background:#4A3022;color:#F8F4EE;text-decoration:none;padding:12px 18px;border-radius:8px">${link.label}</a></p>` : ''}
</div></body></html>`
}

export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
