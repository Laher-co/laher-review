'use client'

// Photos attached to a message: picked from the camera or photo library (or
// dropped on desktop), checked, converted from HEIC, shrunk and re-saved as
// JPEG in the browser (quick on mobile data, and strips location data), then
// uploaded when the message is sent.
import { useCallback, useRef, useState } from 'react'
import { checkImage, fitWithin, MAX_IMAGES } from '@/lib/image-rules'

export type PreparedPhoto = { id: string; name: string; blob: Blob; preview: string }
export type UploadedPhoto = { url: string; name: string; contentType: string; size: number }

const jpegName = (name: string) => `${name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`

async function decode(file: Blob, heic: boolean): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (err) {
    if (!heic) throw err
    // Browsers other than Safari can't open HEIC: convert it first
    const { default: heic2any } = await import('heic2any')
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 })
    return createImageBitmap(Array.isArray(converted) ? converted[0] : converted)
  }
}

export async function preparePhoto(file: File): Promise<PreparedPhoto | { error: string }> {
  const check = checkImage(file)
  if ('error' in check) return check
  let bitmap: ImageBitmap
  try { bitmap = await decode(file, check.kind === 'heic') } catch {
    return { error: `“${file.name}” couldn’t be opened. Please try a different photo.` }
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff' // transparent PNGs get a white background, not black
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85))
  if (!blob) return { error: `“${file.name}” couldn’t be prepared. Please try again.` }
  return { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, name: jpegName(file.name), blob, preview: URL.createObjectURL(blob) }
}

/** The photos on a message being written, with any problems to show. */
export function usePhotoAttachments() {
  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  const [preparing, setPreparing] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const count = useRef(0)
  count.current = photos.length + preparing

  const add = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files)
    const room = MAX_IMAGES - count.current
    const problems: string[] = []
    if (list.length > room) problems.push(`You can attach up to ${MAX_IMAGES} photos per message${room > 0 ? `, so only the first ${room} were added` : ''}.`)
    const take = list.slice(0, Math.max(0, room))
    setErrors(problems)
    setPreparing(p => p + take.length)
    // Prepared side by side, then added in the order they were picked
    const results = await Promise.all(take.map(preparePhoto))
    setPreparing(p => p - take.length)
    setErrors(e => [...e, ...results.flatMap(r => ('error' in r ? [r.error] : []))])
    setPhotos(p => [...p, ...results.filter((r): r is PreparedPhoto => !('error' in r))])
  }, [])
  const remove = (id: string) => setPhotos(p => { p.find(x => x.id === id) && URL.revokeObjectURL(p.find(x => x.id === id)!.preview); return p.filter(x => x.id !== id) })
  const clear = () => { photos.forEach(p => URL.revokeObjectURL(p.preview)); setPhotos([]); setErrors([]) }

  /** Uploads every photo (one request each, so each stays small). */
  async function uploadAll(upload: (form: FormData) => Promise<UploadedPhoto | { error: string }>) {
    const out: UploadedPhoto[] = []
    for (const p of photos) {
      const form = new FormData()
      form.set('file', p.blob, p.name)
      const r = await upload(form)
      if ('error' in r) throw new Error(r.error)
      out.push(r)
    }
    return out
  }

  // Drag and drop on desktop
  const [dragging, setDragging] = useState(false)
  const dropProps = {
    onDragOver: (e: React.DragEvent) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); add(e.dataTransfer.files) } },
  }

  return { photos, preparing, errors, add, remove, clear, uploadAll, dropProps, dragging, full: photos.length + preparing >= MAX_IMAGES }
}

/** "Add photos" button: on phones this offers the camera or the photo library. */
export function AddPhotosButton({ onFiles, disabled, className }: { onFiles: (f: FileList) => void; disabled?: boolean; className?: string }) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <>
      <input ref={input} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        onChange={e => { if (e.target.files?.length) onFiles(e.target.files); e.target.value = '' }} />
      <button type="button" disabled={disabled} onClick={() => input.current?.click()} className={className}>
        <span aria-hidden>📷</span> Add photos
      </button>
    </>
  )
}

/** Thumbnails of the photos about to be sent, each with a remove button. */
export function PhotoTray({ photos, preparing, onRemove }: { photos: PreparedPhoto[]; preparing: number; onRemove: (id: string) => void }) {
  if (!photos.length && !preparing) return null
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {photos.map(p => (
        <div key={p.id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-sand bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.preview} alt={p.name} className="h-full w-full object-cover" />
          <button type="button" aria-label={`Remove ${p.name}`} onClick={() => onRemove(p.id)}
            className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white">✕</button>
        </div>
      ))}
      {Array.from({ length: preparing }, (_, i) => (
        <div key={`p${i}`} className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-sand bg-white text-[11px] text-stone">Preparing…</div>
      ))}
    </div>
  )
}
