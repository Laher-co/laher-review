'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type LightboxImage = { url: string; alt?: string; caption?: string }

const MAX_SCALE = 4
const SWIPE_PX  = 60   // horizontal drag to change image
const CLOSE_PX  = 110  // downward drag to close

/**
 * Full-screen image viewer on the same page. Swipe left/right between images,
 * pinch or double-tap to zoom (drag to pan while zoomed), swipe down or tap ×
 * to close. Keyboard: ← → to navigate, Esc to close.
 */
export default function Lightbox({ images, start, onClose }: {
  images: LightboxImage[]; start: number; onClose(): void
}) {
  const [index, setIndex] = useState(start)
  const [view, setViewState] = useState({ scale: 1, x: 0, y: 0 })   // zoom + pan
  const [drag, setDragState] = useState({ x: 0, y: 0 })             // swipe gestures at scale 1
  // Gesture handlers read these refs, which are always current even when
  // several pointer events arrive before React re-renders (fast flicks)
  const viewRef = useRef(view)
  const dragRef = useRef(drag)
  const setView = (v: { scale: number; x: number; y: number }) => { viewRef.current = v; setViewState(v) }
  const setDrag = (d: { x: number; y: number }) => { dragRef.current = d; setDragState(d) }
  const [animating, setAnimating] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)

  // Gesture bookkeeping lives in refs so pointer handlers stay cheap
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture  = useRef<{
    mode: 'none' | 'swipe' | 'pan' | 'pinch'
    startX: number; startY: number; axis: 'x' | 'y' | null
    startView: { scale: number; x: number; y: number }
    startDist: number; startMid: { x: number; y: number }
  }>({ mode: 'none', startX: 0, startY: 0, axis: null, startView: { scale: 1, x: 0, y: 0 }, startDist: 0, startMid: { x: 0, y: 0 } })
  const lastTap = useRef(0)

  const count = images.length
  const go = useCallback((delta: number) => {
    if (count < 2) return
    setAnimating(true)
    setIndex(i => (i + delta + count) % count)
    viewRef.current = { scale: 1, x: 0, y: 0 }; setViewState(viewRef.current)
    dragRef.current = { x: 0, y: 0 }; setDragState(dragRef.current)
  }, [count])

  // Lock page scroll and wire up the keyboard while open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [go, onClose])

  // Preload neighbours so swiping feels instant
  useEffect(() => {
    for (const d of [-1, 1]) {
      const img = new Image()
      img.src = images[(index + d + count) % count].url
    }
  }, [index, images, count])

  /** Keeps a zoomed image from being dragged off screen. */
  function clamp(v: { scale: number; x: number; y: number }) {
    const el = stageRef.current
    if (!el || v.scale <= 1) return { scale: 1, x: 0, y: 0 }
    const maxX = (el.clientWidth * (v.scale - 1)) / 2
    const maxY = (el.clientHeight * (v.scale - 1)) / 2
    return { scale: v.scale, x: Math.max(-maxX, Math.min(maxX, v.x)), y: Math.max(-maxY, Math.min(maxY, v.y)) }
  }

  /** Zooms towards a screen point (pinch midpoint or double-tap spot). */
  function zoomAt(scale: number, cx: number, cy: number, from = viewRef.current) {
    const el = stageRef.current
    if (!el) return from
    const r = el.getBoundingClientRect()
    const px = cx - (r.left + r.width / 2), py = cy - (r.top + r.height / 2)
    const s = Math.max(1, Math.min(MAX_SCALE, scale))
    const k = s / from.scale
    return clamp({ scale: s, x: px - (px - from.x) * k, y: py - (py - from.y) * k })
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch {}
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setAnimating(false)
    const g = gesture.current
    const pts = [...pointers.current.values()]
    if (pts.length === 2) {
      g.mode = 'pinch'
      g.startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      g.startMid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      g.startView = viewRef.current
      setDrag({ x: 0, y: 0 })
    } else if (pts.length === 1) {
      g.mode = viewRef.current.scale > 1 ? 'pan' : 'swipe'
      g.startX = e.clientX; g.startY = e.clientY; g.axis = null
      g.startView = viewRef.current
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const pts = [...pointers.current.values()]

    if (g.mode === 'pinch' && pts.length === 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
      const zoomed = zoomAt(g.startView.scale * (dist / g.startDist), g.startMid.x, g.startMid.y, g.startView)
      setView(clamp({ ...zoomed, x: zoomed.x + mid.x - g.startMid.x, y: zoomed.y + mid.y - g.startMid.y }))
    } else if (g.mode === 'pan') {
      setView(clamp({ ...g.startView, x: g.startView.x + e.clientX - g.startX, y: g.startView.y + e.clientY - g.startY }))
    } else if (g.mode === 'swipe') {
      const dx = e.clientX - g.startX, dy = e.clientY - g.startY
      // Lock to whichever direction the finger moves first
      if (!g.axis && Math.hypot(dx, dy) > 8) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (g.axis === 'x') setDrag({ x: count > 1 ? dx : dx * 0.25, y: 0 })
      if (g.axis === 'y') setDrag({ x: 0, y: Math.max(0, dy) })
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const g = gesture.current
    // A tap is a single finger that barely moved, zoomed in or not
    const wasTap = (g.mode === 'swipe' || g.mode === 'pan') && pointers.current.size === 1
      && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 10
    pointers.current.delete(e.pointerId)

    if (g.mode === 'pinch') {
      if (pointers.current.size === 1) {
        // One finger left on screen: carry on panning from here
        const [p] = [...pointers.current.values()]
        g.mode = viewRef.current.scale > 1 ? 'pan' : 'swipe'
        g.startX = p.x; g.startY = p.y; g.axis = null; g.startView = viewRef.current
      } else {
        g.mode = 'none'
        if (viewRef.current.scale < 1.05) { setAnimating(true); setView({ scale: 1, x: 0, y: 0 }) }
      }
      return
    }
    if (pointers.current.size > 0) return

    if (g.mode === 'swipe' && !wasTap) {
      setAnimating(true)
      const d = dragRef.current
      if (d.y > CLOSE_PX) { g.mode = 'none'; return onClose() }
      if (d.x < -SWIPE_PX) go(1)
      else if (d.x > SWIPE_PX) go(-1)
      else setDrag({ x: 0, y: 0 })
    }

    // Double tap toggles zoom at that point
    if (wasTap) {
      const now = Date.now()
      if (now - lastTap.current < 300) {
        setAnimating(true)
        setView(viewRef.current.scale > 1 ? { scale: 1, x: 0, y: 0 } : zoomAt(2.5, e.clientX, e.clientY))
        lastTap.current = 0
      } else lastTap.current = now
    }
    g.mode = 'none'
  }

  function onWheel(e: React.WheelEvent) {
    setAnimating(false)
    const v = viewRef.current
    setView(zoomAt(v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY, v))
  }

  const img = images[index]
  const fade = Math.max(0.35, 1 - drag.y / 400)

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col text-white" role="dialog" aria-modal="true" aria-label="Image viewer"
      style={{ backgroundColor: `rgba(20,14,10,${fade})` }}>
      <div className="relative z-10 flex items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <span className="px-2 text-sm tabular-nums text-white/80">{count > 1 ? `${index + 1} / ${count}` : ''}</span>
        <button onClick={onClose} aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-full text-3xl leading-none text-white/90 hover:bg-white/10">×</button>
      </div>

      <div ref={stageRef}
        className="relative flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
        style={{ cursor: view.scale > 1 ? 'grab' : 'default' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={img.url} src={img.url} alt={img.alt ?? ''} draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
          style={{
            transform: `translate(${view.x + drag.x}px, ${view.y + drag.y}px) scale(${view.scale})`,
            transition: animating ? 'transform 200ms ease-out' : 'none',
          }} />
      </div>

      {count > 1 && (
        <>
          <button onClick={() => go(-1)} aria-label="Previous image"
            className="absolute left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl hover:bg-white/20 sm:flex">‹</button>
          <button onClick={() => go(1)} aria-label="Next image"
            className="absolute right-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-2xl hover:bg-white/20 sm:flex">›</button>
        </>
      )}

      <p className="px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 text-center text-xs text-white/60">
        {img.caption ? `${img.caption} · ` : ''}
        <span className="sm:hidden">Pinch or double-tap to zoom · swipe down to close</span>
        <span className="hidden sm:inline">Scroll or double-click to zoom · Esc to close</span>
      </p>
    </div>,
    document.body,
  )
}
