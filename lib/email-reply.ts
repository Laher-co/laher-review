// Customer replies by email: each job has its own address, j<token>@reply.laher.co.
// Pure helpers (no I/O) so the clean-up rules are unit tested.

export const REPLY_DOMAIN = 'reply.laher.co'

export function newReplyToken() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789' // no look-alikes
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('')
}

export const replyAddress = (token: string) => `j${token}@${REPLY_DOMAIN}`

/** The job token from an address like "LAHER <jabc123@reply.laher.co>", or null. */
export function tokenFromAddress(address: string): string | null {
  const m = address.toLowerCase().match(/\bj([a-z0-9]{6,32})@reply\.laher\.co\b/)
  return m ? m[1] : null
}

/** Rough HTML → text for replies that only have an HTML part. Quoted blocks are dropped. */
export function htmlToText(html: string) {
  return html
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, '')
    .replace(/<div class="gmail_quote[\s\S]*$/i, '')
    .replace(/<div id="(divRplyFwdMsg|appendonsend)"[\s\S]*$/i, '')
    .replace(/<(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, '’')
}

/**
 * Keeps only what the customer just wrote: drops the quoted earlier email
 * ("On … wrote:", "-----Original Message-----", "From: … Sent:", "> " lines)
 * and common signatures ("-- ", "Sent from my iPhone", "Get Outlook for …").
 */
export function stripQuotedReply(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const t = line.trim()
    const next = (lines[i + 1] ?? '').trim()
    // Start of the quoted previous email
    if (/^On\b.{0,200}\bwrote:\s*$/i.test(t)) break
    if (/^On\b.{0,200}$/i.test(t) && /^.{0,200}\bwrote:\s*$/i.test(next) && t.length + next.length < 300) break
    if (/^-{2,}\s*(Original|Forwarded) Message\s*-{2,}$/i.test(t)) break
    if (/^_{10,}$/.test(t)) break
    if (/^From:\s.+/i.test(t) && lines.slice(i + 1, i + 5).some(l => /^(Sent|Date|To|Subject):\s/i.test(l.trim()))) break
    if (/^(Le|Am|El)\s.+(a écrit|schrieb|escribió)\s*:\s*$/i.test(t)) break
    // Signatures
    if (t === '--' || line === '-- ') break
    if (/^Sent from my (iPhone|iPad|Android|Samsung|Galaxy|Pixel|mobile)/i.test(t)) break
    if (/^Get Outlook for (iOS|Android)/i.test(t)) break
    if (t.startsWith('>')) continue
    out.push(line)
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Out-of-office and other automatic replies shouldn't count as the customer responding. */
export function isAutoReply(subject: string, headers: Record<string, string> = {}) {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]))
  if (h['auto-submitted'] && h['auto-submitted'] !== 'no') return true
  if (h['x-autoreply'] || h['x-autorespond'] || h['precedence'] === 'auto_reply') return true
  return /^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|autoreply|away from)\b/i.test(subject.trim())
}
