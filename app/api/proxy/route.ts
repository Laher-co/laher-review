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
  // Handled formats:
  //   /file/d/FILE_ID/view             (with or without ?usp=sharing)
  //   /file/d/FILE_ID/view?usp=sharing
  //   /open?id=FILE_ID
  // All converted to: https://drive.google.com/uc?export=download&id=FILE_ID
  if (host.includes('drive.google.com')) {
    // Format 1 & 2: /file/d/FILE_ID/...
    const pathMatch = parsed.pathname.match(/\/file\/d\/([^/?#]+)/)
    if (pathMatch) {
      return new URL(`https://drive.google.com/uc?export=download&id=${pathMatch[1]}`)
    }
    // Format 3: /open?id=FILE_ID  or  any path with ?id=FILE_ID
    const idParam = parsed.searchParams.get('id')
    if (idParam) {
      return new URL(`https://drive.google.com/uc?export=download&id=${idParam}`)
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

  // If the caller requests Trello auth, append credentials from env vars.
  // Only ever for Trello's own hosts — otherwise anyone could point the proxy
  // at their own server and read the key and token off the request.
  // Trello only accepts credentials for attachment downloads in an
  // Authorization header (key/token query params get a 401). fetch drops the
  // header when Trello redirects to its file storage on another host.
  const headers: Record<string, string> = { 'User-Agent': 'Laher-Review/1.0' }
  const isTrelloHost = parsed.hostname === 'trello.com' || parsed.hostname === 'api.trello.com'
  if (useToken && isTrelloHost) {
    const apiKey = process.env.TRELLO_API_KEY
    const token  = process.env.TRELLO_TOKEN
    console.log('[proxy] Trello auth — key present:', !!apiKey, '| token present:', !!token)
    if (apiKey && token) {
      headers.Authorization = `OAuth oauth_consumer_key="${apiKey}", oauth_token="${token}"`
    }
  }

  console.log('[proxy] fetching:', parsed.origin + parsed.pathname)

  try {
    const response = await fetch(parsed.href, {
      headers,
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
