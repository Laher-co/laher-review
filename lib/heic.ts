import 'server-only'
import { isHeic } from './image-rules'

/** iPhone photos emailed to us: HEIC becomes JPEG so every browser can show it. Null if it isn't HEIC. */
export async function heicToJpeg(data: ArrayBuffer): Promise<Uint8Array | null> {
  if (!isHeic(new Uint8Array(data.slice(0, 16)))) return null
  const { default: convert } = await import('heic-convert')
  return convert({ buffer: new Uint8Array(data), format: 'JPEG', quality: 0.85 })
}
