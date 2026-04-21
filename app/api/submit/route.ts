import { NextRequest, NextResponse } from 'next/server'

/**
 * Upload a base64 PNG to imgbb and return its public URL.
 * imgbb free tier: unlimited uploads, images hosted permanently.
 * Docs: https://api.imgbb.com/
 */
async function uploadToImgbb(base64DataUrl: string): Promise<string> {
  const apiKey = process.env.IMGBB_API_KEY
  if (!apiKey) throw new Error('IMGBB_API_KEY is not configured.')

  // Strip the data URL prefix (e.g. "data:image/png;base64,") — imgbb wants raw base64
  const base64 = base64DataUrl.replace(/^data:image\/\w+;base64,/, '')

  const form = new FormData()
  form.append('key', apiKey)
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
  if (!json.success || !json.data?.url) {
    throw new Error('imgbb returned an unexpected response.')
  }

  return json.data.url
}

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

  // If a base64 annotated image is present, upload it and replace with a public URL
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

  try {
    const res = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      cache:   'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Webhook responded with ${res.status}.`, detail: text },
        { status: res.status },
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reach webhook.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
