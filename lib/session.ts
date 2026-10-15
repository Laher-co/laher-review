// Staff session cookie: base64url(JSON payload) + "." + HMAC-SHA256 signature.
// Uses Web Crypto so it works in middleware (edge) and server code alike.

export const SESSION_COOKIE = 'laher_staff'
export const SESSION_DAYS   = 30

export interface StaffSession { staffId: string; name: string; exp: number }

const enc = new TextEncoder()

function b64url(bytes: Uint8Array) {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function hmac(data: string) {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be set (32+ characters).')
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))))
}

export async function signSession(staffId: string, name: string): Promise<string> {
  const payload: StaffSession = { staffId, name, exp: Date.now() + SESSION_DAYS * 86_400_000 }
  const body = b64url(enc.encode(JSON.stringify(payload)))
  return `${body}.${await hmac(body)}`
}

export async function verifySession(token: string | undefined): Promise<StaffSession | null> {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  try {
    const expected = await hmac(body)
    // Constant-time comparison
    if (expected.length !== sig.length) return null
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
    if (diff !== 0) return null
    const session = JSON.parse(new TextDecoder().decode(fromB64url(body))) as StaffSession
    return session.exp > Date.now() ? session : null
  } catch {
    return null
  }
}
