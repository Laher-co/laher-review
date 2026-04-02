import { NextRequest, NextResponse } from 'next/server'

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

  // If the caller requests Trello auth, append credentials from env vars
  if (useToken) {
    const apiKey = process.env.TRELLO_API_KEY
    const token  = process.env.TRELLO_TOKEN
    if (apiKey) parsed.searchParams.set('key',   apiKey)
    if (token)  parsed.searchParams.set('token', token)
  }

  try {
    const response = await fetch(parsed.href, {
      headers: { 'User-Agent': 'Laher-Review/1.0' },
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: response.status })
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
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
