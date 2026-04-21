import { NextRequest, NextResponse } from 'next/server'

const BACKUP_EMAIL = 'info@leiedesign.com'

// ── imgbb ─────────────────────────────────────────────────────────────────────

async function uploadToImgbb(base64DataUrl: string): Promise<string> {
  const apiKey = process.env.IMGBB_API_KEY
  if (!apiKey) throw new Error('IMGBB_API_KEY is not configured.')

  const base64 = base64DataUrl.replace(/^data:image\/\w+;base64,/, '')
  const form   = new FormData()
  form.append('key',   apiKey)
  form.append('image', base64)

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body:   form,
    cache:  'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`imgbb upload failed (${res.status}): ${text}`)
  }

  const json = await res.json() as { success: boolean; data?: { url: string } }
  if (!json.success || !json.data?.url) throw new Error('imgbb returned an unexpected response.')
  return json.data.url
}

// ── Resend backup email ───────────────────────────────────────────────────────

async function sendBackupEmail(payload: Record<string, unknown>): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[submit] RESEND_API_KEY not set — skipping backup email.')
    return
  }

  const action      = String(payload.action      ?? '')
  const email       = String(payload.email       ?? '')
  const cardId      = String(payload.cardId      ?? '')
  const designer    = String(payload.designer    ?? '')
  const feedback    = String(payload.feedback    ?? '—')
  const imageUrl    = typeof payload.annotatedImage === 'string' ? payload.annotatedImage : null

  const subject = `New Review Submission - ${action} - ${email}`

  const html = `
    <h2 style="font-family:sans-serif;margin-bottom:16px">New Design Review Submission</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:6px 16px 6px 0;color:#666;white-space:nowrap"><strong>Action</strong></td><td style="padding:6px 0">${action}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666;white-space:nowrap"><strong>Customer email</strong></td><td style="padding:6px 0">${email}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666;white-space:nowrap"><strong>Designer</strong></td><td style="padding:6px 0">${designer}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666;white-space:nowrap"><strong>Card ID</strong></td><td style="padding:6px 0">${cardId}</td></tr>
      <tr><td style="padding:6px 16px 6px 0;color:#666;white-space:nowrap;vertical-align:top"><strong>Feedback</strong></td><td style="padding:6px 0">${feedback}</td></tr>
      ${imageUrl ? `<tr><td style="padding:6px 16px 6px 0;color:#666;white-space:nowrap"><strong>Annotated image</strong></td><td style="padding:6px 0"><a href="${imageUrl}">${imageUrl}</a></td></tr>` : ''}
    </table>
    ${imageUrl ? `<p style="margin-top:24px"><img src="${imageUrl}" alt="Annotated design" style="max-width:600px;border:1px solid #eee;border-radius:4px" /></p>` : ''}
  `.trim()

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    'Laher Review <onboarding@resend.dev>',
      to:      [BACKUP_EMAIL],
      subject,
      html,
    }),
    cache: 'no-store',
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[submit] Resend error:', res.status, text)
  } else {
    console.log('[submit] backup email sent to', BACKUP_EMAIL)
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const webhookUrl = process.env.webhook_url || process.env.WEBHOOK_URL
  if (!webhookUrl) {
    return NextResponse.json({ error: 'Webhook URL is not configured.' }, { status: 500 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  // Upload base64 annotated image to imgbb → replace with public URL
  if (typeof body.annotatedImage === 'string' && body.annotatedImage.startsWith('data:')) {
    try {
      const imageUrl = await uploadToImgbb(body.annotatedImage)
      body = { ...body, annotatedImage: imageUrl }
      console.log('[submit] annotated image uploaded:', imageUrl)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Image upload failed.'
      console.error('[submit] imgbb upload error:', message)
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Fire webhook and backup email in parallel — don't let email failure block the response
  const [webhookResult] = await Promise.allSettled([
    fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      cache:   'no-store',
    }),
    sendBackupEmail(body),
  ])

  if (webhookResult.status === 'rejected') {
    const message = webhookResult.reason instanceof Error
      ? webhookResult.reason.message
      : 'Failed to reach webhook.'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const webhookRes = webhookResult.value
  if (!webhookRes.ok) {
    const text = await webhookRes.text().catch(() => '')
    return NextResponse.json(
      { error: `Webhook responded with ${webhookRes.status}.`, detail: text },
      { status: webhookRes.status },
    )
  }

  return NextResponse.json({ ok: true })
}
