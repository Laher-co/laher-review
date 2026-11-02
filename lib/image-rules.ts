// Rules for photos attached to messages. Pure, so the browser and server
// share them and they're unit tested.

export const MAX_IMAGES = 5
export const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024   // what the customer can pick
export const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024    // after resizing (server action limit is 4 MB)
export const MAX_EDGE = 2048                          // longest side after resizing

const TYPES: Record<string, 'jpeg' | 'png' | 'webp' | 'heic'> = {
  'image/jpeg': 'jpeg', 'image/jpg': 'jpeg', 'image/pjpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heic', 'image/heic-sequence': 'heic', 'image/heif-sequence': 'heic',
}
const EXTENSIONS: Record<string, 'jpeg' | 'png' | 'webp' | 'heic'> = {
  jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', heic: 'heic', heif: 'heic',
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`

/** Which kind of photo this is (by type, or by name when the browser gives no type), or an error to show. */
export function checkImage(f: { name: string; type: string; size: number }): { kind: 'jpeg' | 'png' | 'webp' | 'heic' } | { error: string } {
  const kind = TYPES[f.type.toLowerCase()] ?? (f.type && !f.type.startsWith('application/octet') ? undefined : EXTENSIONS[f.name.split('.').pop()?.toLowerCase() ?? ''])
  if (!kind) return { error: `“${f.name}” isn’t a photo we can use. Please choose a JPG, PNG, WebP or iPhone (HEIC) photo.` }
  if (f.size > MAX_ORIGINAL_BYTES) return { error: `“${f.name}” is too big (${mb(f.size)}). Photos can be up to 20 MB.` }
  return { kind }
}

/** Size to draw a photo at so its longest side is at most MAX_EDGE. */
export function fitWithin(width: number, height: number, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** What the server accepts: the first bytes of a JPEG, PNG or WebP file. */
export function sniffImage(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp'
  return null
}

/** True for an HEIC/HEIF file, from its first bytes ("ftyp" + an HEIF brand). */
export function isHeic(bytes: Uint8Array) {
  if (String.fromCharCode(...bytes.slice(4, 8)) !== 'ftyp') return false
  return ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(String.fromCharCode(...bytes.slice(8, 12)))
}

/** A message image must be one of this job's uploads in our Blob store. */
export function isJobImageUrl(raw: string, jobId: string) {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com') && u.pathname.startsWith(`/message-images/${jobId}/`)
  } catch { return false }
}
