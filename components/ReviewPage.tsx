'use client'

import { useEffect, useRef, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Decision = 'approved' | 'changes_requested'

interface Stroke {
  points: { x: number; y: number }[]
  color: string
  width: number
}

interface Props {
  customerEmail: string
  designerName: string
  imageUrl: string
  cardId: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = [
  { hex: '#EF4444', label: 'Red' },
  { hex: '#3B82F6', label: 'Blue' },
  { hex: '#22C55E', label: 'Green' },
  { hex: '#F59E0B', label: 'Amber' },
  { hex: '#111111', label: 'Black' },
]

const SIZES = [
  { label: 'S', value: 2 },
  { label: 'M', value: 5 },
  { label: 'L', value: 10 },
]

// ── Icons ─────────────────────────────────────────────────────────────────────

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="20" stroke="#111" strokeWidth="2" />
      <path d="M15 24L21 30L33 18" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="20" stroke="#111" strokeWidth="2" />
      <path d="M24 14V24L30 30" stroke="#111" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── SuccessView ───────────────────────────────────────────────────────────────

function SuccessView({ decision, designerName }: { decision: Decision; designerName: string }) {
  const approved = decision === 'approved'
  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col">
      <header className="bg-black px-8 py-5">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-inter text-white text-xl font-semibold tracking-[0.3em] uppercase">Laher</h1>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="flex justify-center mb-6">
            {approved ? <CheckCircleIcon /> : <ClockIcon />}
          </div>
          <h2 className="font-inter text-2xl font-light text-gray-900 mb-3">
            {approved ? 'Design Approved' : 'Changes Requested'}
          </h2>
          <p className="text-gray-500 text-sm leading-relaxed" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
            {approved
              ? `Your approval has been sent to ${designerName}. They'll be in touch soon to progress your order.`
              : `Your feedback has been sent to ${designerName}. They'll review your notes and get back to you with an updated design.`}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReviewPage({ customerEmail, designerName, imageUrl, cardId }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // All strokes — mutated directly, never stored in React state
  const strokesRef   = useRef<Stroke[]>([])
  const bgRef        = useRef<HTMLImageElement | null>(null)

  // Current in-progress stroke
  const activeRef    = useRef<Stroke | null>(null)
  const drawingRef   = useRef(false)

  // Mirrors for color/size so event handlers always see the latest value
  const colorRef     = useRef(COLORS[0].hex)
  const widthRef     = useRef(SIZES[1].value) // default M

  // UI state
  const [color,       setColor]       = useState(COLORS[0].hex)
  const [width,       setWidth]       = useState(SIZES[1].value) // default M
  const [ready,       setReady]       = useState(false)
  const [feedback,    setFeedback]    = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [decision,    setDecision]    = useState<Decision | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Keep mirrors in sync
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { widthRef.current = width }, [width])

  // ── Canvas setup & drawing ─────────────────────────────────────────────────

  useEffect(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return


    // Paint all committed strokes + the active in-progress one
    function redraw() {
      const ctx = canvas!.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas!.width, canvas!.height)
      if (bgRef.current) ctx.drawImage(bgRef.current, 0, 0, canvas!.width, canvas!.height)
      const all = activeRef.current
        ? [...strokesRef.current, activeRef.current]
        : strokesRef.current
      for (const s of all) paintStroke(ctx, s)
    }

    function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
      if (s.points.length === 0) return
      ctx.save()
      ctx.strokeStyle = s.color
      ctx.lineWidth   = s.width
      ctx.lineCap     = 'round'
      ctx.lineJoin    = 'round'
      ctx.beginPath()
      ctx.moveTo(s.points[0].x, s.points[0].y)
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y)
      ctx.stroke()
      if (s.points.length === 1) {
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(s.points[0].x, s.points[0].y, s.width / 2, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }

    function toCanvas(e: MouseEvent) {
      const r  = canvas!.getBoundingClientRect()
      return {
        x: (e.clientX - r.left) * (canvas!.width  / r.width),
        y: (e.clientY - r.top)  * (canvas!.height / r.height),
      }
    }

    function onDown(e: MouseEvent) {
      drawingRef.current = true
      activeRef.current  = { points: [toCanvas(e)], color: colorRef.current, width: widthRef.current }
      redraw()
    }

    function onMove(e: MouseEvent) {
      if (!drawingRef.current || !activeRef.current) return
      activeRef.current.points.push(toCanvas(e))
      redraw()
    }

    function onUp() {
      if (!drawingRef.current || !activeRef.current) return
      strokesRef.current = [...strokesRef.current, activeRef.current]
      activeRef.current  = null
      drawingRef.current = false
      redraw()
    }

    // Expose redraw so the undo button can call it
    ;(canvas as unknown as { _redraw: () => void })._redraw = redraw

    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)

    // Load background image — size the pixel buffer to the image's natural
    // dimensions (capped at 1600px wide). CSS w-full stretches the canvas to
    // fill the container; toCanvas() accounts for the CSS/pixel scale factor.
    let cancelled = false
    const img = new Image()
    img.onload = () => {
      if (cancelled) return
      bgRef.current = img
      // Cap at 1600×1200 px while maintaining aspect ratio
      const scale = Math.min(1, 1600 / img.naturalWidth, 1200 / img.naturalHeight)
      canvas.width  = Math.round(img.naturalWidth  * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      redraw()
      setReady(true)
    }
    img.onerror = () => {
      if (cancelled) return
      canvas.width  = 800
      canvas.height = 600
      setReady(true)
    }
    img.src = `/api/proxy?url=${encodeURIComponent(imageUrl)}`

    return () => {
      cancelled = true
      img.src   = ''
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [imageUrl])

  // ── Undo ──────────────────────────────────────────────────────────────────

  function handleUndo() {
    if (strokesRef.current.length === 0) return
    strokesRef.current = strokesRef.current.slice(0, -1)
    const canvas = canvasRef.current as unknown as { _redraw: () => void }
    canvas._redraw()
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit(d: Decision) {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const annotatedImage = canvasRef.current?.toDataURL('image/png') ?? ''
      const webhookUrl     = process.env.NEXT_PUBLIC_WEBHOOK_URL
      if (!webhookUrl) throw new Error('Webhook URL is not configured.')
      const res = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, customerEmail, designerName, decision: d, feedback, annotatedImage, submittedAt: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error(`Server responded with ${res.status}.`)
      setDecision(d)
      setSubmitted(true)
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const displayName = customerEmail.split('@')[0].replace(/[._-]/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  if (submitted && decision) return <SuccessView decision={decision} designerName={designerName} />

  return (
    <div className="min-h-screen bg-[#FAF9F6]">

      <header className="bg-black px-8 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="font-inter text-white text-xl font-semibold tracking-[0.3em] uppercase select-none">
            Laher
          </h1>
          <span className="text-white/40 text-xs tracking-widest uppercase"
            style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
            Design Review
          </span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 pt-8 pb-5">
        <h2 className="font-inter text-[1.6rem] font-light text-gray-900 leading-tight">
          Hello, {displayName}
        </h2>
        <p className="mt-1.5 text-gray-500 text-sm leading-relaxed"
          style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
          <span className="text-gray-700 font-medium">{designerName}</span> has shared a design for
          your review. Draw directly on the image, add written feedback, then submit your decision below.
        </p>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-16">
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* Canvas column */}
          <div className="flex-1 min-w-0 w-full">

            {/* Toolbar */}
            <div className="mb-3 flex flex-wrap items-center gap-2.5">

              {/* Colour picker */}
              <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-sm">
                {COLORS.map(c => (
                  <button key={c.hex} onClick={() => setColor(c.hex)} title={c.label}
                    className={`w-5 h-5 rounded-full transition-all ${
                      color === c.hex ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.hex }} />
                ))}
              </div>

              {/* Size selector */}
              <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                {SIZES.map(s => (
                  <button key={s.value} onClick={() => setWidth(s.value)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      width === s.value
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Undo */}
              <button onClick={handleUndo} title="Undo last stroke"
                className="ml-auto p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors shadow-sm">
                <UndoIcon />
              </button>
            </div>

            {/* Canvas */}
            <div ref={containerRef}
              className="w-full overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-gray-100">
              {!ready && (
                <div className="flex items-center justify-center h-96">
                  <span className="text-gray-400 text-sm tracking-wide"
                    style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>Loading design…</span>
                </div>
              )}
              <canvas ref={canvasRef} className="block w-full cursor-crosshair" />
            </div>

            <p className="mt-2 text-xs text-gray-400" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
              Draw directly on the image. Use the toolbar to change colour or brush size.
            </p>
          </div>

          {/* Feedback panel */}
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col gap-4">

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-inter text-sm font-semibold text-gray-900 uppercase tracking-widest mb-3">
                Written Feedback
              </h3>
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)}
                placeholder="Add any notes or comments for your designer…"
                rows={7}
                className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:bg-white transition-colors leading-relaxed"
                style={{ fontFamily: 'Helvetica, Arial, sans-serif' }} />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-inter text-sm font-semibold text-gray-900 uppercase tracking-widest mb-1">
                Submit Review
              </h3>
              <p className="text-xs text-gray-400 mb-5 leading-relaxed"
                style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                Your annotations and feedback will be sent directly to {designerName}.
              </p>

              {submitError && (
                <p className="text-xs text-red-500 mb-4 bg-red-50 border border-red-100 rounded-lg px-3 py-2"
                  style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                  {submitError}
                </p>
              )}

              <button onClick={() => handleSubmit('approved')} disabled={submitting || !ready}
                className="w-full py-3.5 bg-gray-900 text-white rounded-lg font-inter text-sm font-medium tracking-wide hover:bg-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-3">
                {submitting ? 'Submitting…' : 'Approve Design'}
              </button>
              <button onClick={() => handleSubmit('changes_requested')} disabled={submitting || !ready}
                className="w-full py-3.5 border border-gray-300 text-gray-800 rounded-lg font-inter text-sm font-medium tracking-wide hover:border-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                Request Changes
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
