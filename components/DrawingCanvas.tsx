'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

// Strokes are stored in image-relative units (0–1) so they stay meaningful
// whatever size the render is shown at — useful for the AI that reads feedback.
export type Stroke = { color: string; width: number; points: [number, number][] }

export interface DrawingHandle {
  undo(): void
  clear(): void
  strokes(): Stroke[]
  /** Render + drawing flattened to a JPEG, max 1600px wide */
  exportJpeg(): Promise<Blob | null>
}

export const PEN_COLOURS = [
  { hex: '#E0302B', label: 'Red' },
  { hex: '#2563EB', label: 'Blue' },
  { hex: '#111111', label: 'Black' },
  { hex: '#FFFFFF', label: 'White' },
]
export const PEN_SIZES = [{ label: 'S', px: 3 }, { label: 'M', px: 6 }, { label: 'L', px: 12 }]

interface Props {
  src: string
  colour: string
  size: number            // on-screen pixels
  initial?: Stroke[]
  onChange?(count: number): void
}

const DrawingCanvas = forwardRef<DrawingHandle, Props>(function DrawingCanvas(
  { src, colour, size, initial = [], onChange }, ref,
) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const imgRef     = useRef<HTMLImageElement | null>(null)
  const strokesRef = useRef<Stroke[]>(initial)
  const activeRef  = useRef<Stroke | null>(null)
  const penRef     = useRef({ colour, size })
  const [ready, setReady]   = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => { penRef.current = { colour, size } }, [colour, size])

  function redraw() {
    const c = canvasRef.current, img = imgRef.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, c.width, c.height)
    if (img) ctx.drawImage(img, 0, 0, c.width, c.height)
    const all = activeRef.current ? [...strokesRef.current, activeRef.current] : strokesRef.current
    for (const s of all) paint(ctx, s, c.width, c.height)
  }

  useImperativeHandle(ref, () => ({
    undo() {
      strokesRef.current = strokesRef.current.slice(0, -1)
      onChange?.(strokesRef.current.length)
      redraw()
    },
    clear() {
      strokesRef.current = []
      onChange?.(0)
      redraw()
    },
    strokes: () => strokesRef.current,
    exportJpeg: () => new Promise(resolve => {
      const c = canvasRef.current
      if (!c) return resolve(null)
      c.toBlob(b => resolve(b), 'image/jpeg', 0.85)
    }),
  }))

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    let cancelled = false

    const img = new Image()
    img.crossOrigin = 'anonymous' // Blob storage sends CORS headers; keeps the canvas exportable
    img.onload = () => {
      if (cancelled) return
      imgRef.current = img
      const scale = Math.min(1, 1600 / img.naturalWidth)
      c.width  = Math.round(img.naturalWidth * scale)
      c.height = Math.round(img.naturalHeight * scale)
      setReady(true)
      redraw()
    }
    img.onerror = () => { if (!cancelled) setFailed(true) }
    img.src = src

    const toRel = (e: PointerEvent): [number, number] => {
      const r = c.getBoundingClientRect()
      return [
        Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      ]
    }
    // Only the primary pointer draws, so a pinch doesn't leave stray marks
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      e.preventDefault()
      try { c.setPointerCapture(e.pointerId) } catch {}
      const r = c.getBoundingClientRect()
      activeRef.current = { color: penRef.current.colour, width: penRef.current.size / r.width, points: [toRel(e)] }
      redraw()
    }
    const move = (e: PointerEvent) => {
      if (!activeRef.current || !e.isPrimary) return
      e.preventDefault()
      activeRef.current.points.push(toRel(e))
      redraw()
    }
    const up = (e: PointerEvent) => {
      if (!activeRef.current || !e.isPrimary) return
      strokesRef.current = [...strokesRef.current, simplify(activeRef.current)]
      activeRef.current = null
      onChange?.(strokesRef.current.length)
      redraw()
    }
    c.addEventListener('pointerdown', down)
    c.addEventListener('pointermove', move)
    c.addEventListener('pointerup', up)
    c.addEventListener('pointercancel', up)
    return () => {
      cancelled = true
      c.removeEventListener('pointerdown', down)
      c.removeEventListener('pointermove', move)
      c.removeEventListener('pointerup', up)
      c.removeEventListener('pointercancel', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  return (
    <div className="relative overflow-hidden rounded-xl border border-sand bg-white">
      {!ready && (
        <div className="flex aspect-[4/3] items-center justify-center text-sm text-stone">
          {failed ? 'This image couldn’t be loaded for drawing.' : 'Loading…'}
        </div>
      )}
      {/* touch-none stops finger drags from scrolling the page */}
      <canvas ref={canvasRef} className={`block w-full touch-none select-none ${ready ? '' : 'hidden'}`}
        style={{ cursor: 'crosshair' }} />
    </div>
  )
})

export default DrawingCanvas

function paint(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  if (s.points.length === 0) return
  ctx.save()
  ctx.strokeStyle = s.color
  ctx.fillStyle   = s.color
  ctx.lineWidth   = Math.max(1, s.width * w)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // A light shadow keeps white and black marks visible on any render
  ctx.shadowColor = s.color === '#FFFFFF' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.6)'
  ctx.shadowBlur  = 2
  if (s.points.length === 1) {
    ctx.beginPath()
    ctx.arc(s.points[0][0] * w, s.points[0][1] * h, ctx.lineWidth / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(s.points[0][0] * w, s.points[0][1] * h)
    for (const [x, y] of s.points.slice(1)) ctx.lineTo(x * w, y * h)
    ctx.stroke()
  }
  ctx.restore()
}

/** Drops near-duplicate points and rounds, keeping stored strokes small. */
function simplify(s: Stroke): Stroke {
  const out: [number, number][] = []
  for (const [x, y] of s.points) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(x - last[0], y - last[1]) > 0.002) out.push([+x.toFixed(4), +y.toFixed(4)])
  }
  return { ...s, width: +s.width.toFixed(4), points: out }
}
