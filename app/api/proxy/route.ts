import { NextRequest, NextResponse } from 'next/server'

/**
 * Normalise a share URL into a direct-download URL.
 * Returns a new URL object (or the same one if no conversion was needed).
 */
function toDirectUrl(parsed: URL): URL {
  const host = parsed.hostname // e.g. "www.dropbox.com"

  // ── Dropbox ──────────────────────────────────────────────────────────────
  // Replace dl=0 with dl=1 and add raw=1 so the file is served directly.
  if (host.includes('dropbox.com')) {
    parsed.searchParams.set('dl', '1')
    if (!parsed.searchParams.has('raw')) {
      parsed.searchParams.set('raw', '1')
    }
    return parsed
  }

  // ── Google Drive ─────────────────────────────────────────────────────────
  // Sharing URLs:  https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // Direct URL:    https://drive.google.com/uc?export=download&id=FILE_ID
  if (host.includes('drive.google.com')) {
    const match = parsed.pathname.match(/\/file\/d\/([^/]+)/)
    if (match) {
      const fileId = match[1]
      return new URL(`https://drive.google.com/uc?export=download&id=${fileId}`)
    }
  }

  return parsed
}

export async function GET(request: NextRequest) {
  const raw      = request.nextUrl.searchParams.get('url')
  const useToken = request.nextUrl.searchParams.has('token')

  if (!raw) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 })
  }

  // Only allow plain http/https URLs — blocks SSRF against internal metadata services
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid url parameter' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: 'Only http/https URLs are allowed' }, { status: 400 })
  }

  // Convert share URLs to direct-download URLs
  parsed = toDirectUrl(parsed)
  console.log('[proxy] resolved url:', parsed.href)

  // If the caller requests Trello auth, append credentials from env vars
  if (useToken) {
    const apiKey = process.env.TRELLO_API_KEY
    const token  = process.env.TRELLO_TOKEN
    console.log('[proxy] Trello auth — key present:', !!apiKey, '| token present:', !!token)
    if (apiKey) parsed.searchParams.set('key',   apiKey)
    if (token)  parsed.searchParams.set('token', token)
  }

  console.log('[proxy] fetching:', parsed.href)

  try {
    const response = await fetch(parsed.href, {
      headers: { 'User-Agent': 'Laher-Review/1.0' },
      cache: 'no-store',
    })

    console.log('[proxy] upstream status:', response.status, response.statusText)

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch image', upstreamStatus: response.status },
        { status: response.status },
      )
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    const buffer = await response.arrayBuffer()

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600, immutable',
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to proxy image'
    console.log('[proxy] fetch error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
