import 'server-only'
import { put } from '@vercel/blob'
import type { MessageAttachment } from './db'
import { isJobImageUrl, MAX_IMAGES, MAX_UPLOAD_BYTES, sniffImage } from './image-rules'

/**
 * Saves one message photo (already shrunk in the browser) in Blob under an
 * unguessable name. The file's own bytes decide whether it's an image.
 */
export async function saveMessageImage(jobId: string, file: unknown): Promise<MessageAttachment | { error: string }> {
  if (!(file instanceof Blob) || file.size === 0) return { error: 'No photo was received. Please try again.' }
  if (file.size > MAX_UPLOAD_BYTES) return { error: 'That photo is too big to send. Please try a smaller one.' }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffImage(bytes.slice(0, 16))
  if (!type) return { error: 'That file isn’t a JPG, PNG or WebP photo.' }
  const ext = type.split('/')[1].replace('jpeg', 'jpg')
  const name = (file as File).name?.slice(0, 120) || `photo.${ext}`
  const blob = await put(`message-images/${jobId}/${crypto.randomUUID()}.${ext}`, Buffer.from(bytes), { access: 'public', contentType: type, addRandomSuffix: false })
  return { url: blob.url, name, contentType: type, size: bytes.length }
}

/** The photos sent with a message: only this job's uploads, at most 5. */
export function checkedImages(jobId: string, input: unknown): MessageAttachment[] {
  if (!Array.isArray(input)) return []
  return input.filter((a): a is MessageAttachment => !!a && typeof a.url === 'string' && isJobImageUrl(a.url, jobId))
    .slice(0, MAX_IMAGES)
    .map(a => ({ url: a.url, name: String(a.name ?? 'photo.jpg').slice(0, 120), contentType: String(a.contentType ?? 'image/jpeg'), size: Number(a.size) || 0 }))
}
