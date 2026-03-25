'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Tool = 'select' | 'draw' | 'rect' | 'circle' | 'text'
type Decision = 'approved' | 'changes_requested'

const PRESET_COLORS = [
  { hex: '#EF4444', label: 'Red' },
  { hex: '#3B82F6', label: 'Blue' },
  { hex: '#22C55E', label: 'Green' },
  { hex: '#F59E0B', label: 'Amber' },
  { hex: '#A855F7', label: 'Purple' },
  { hex: '#111111', label: 'Black' },
]

const BRUSH_SIZES = [
  { label: 'S', value: 2 },
  { label: 'M', value: 4 },
  { label: 'L', value: 8 },
]

interface Props {
  customerEmail: string
  designerName: string
  imageUrl: string
  cardId: string
}

// ─── Icon components ────────────────────────────────────────────────────────

function SelectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3.5 1.5L12.5 7.5L8.5 9L6.5 14.5L3.5 1.5Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M10.5 2.5L13.5 5.5L5.5 13.5H2.5V10.5L10.5 2.5Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M8.5 4.5L11.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function RectIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2.5" y="4.5" width="11" height="7" rx="0.5"
        stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function CircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <ellipse cx="8" cy="8" rx="5.5" ry="4.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

function TextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 4.5H13M8 4.5V12.5M5.5 12.5H10.5"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5.5 5.5H9.5C11.43 5.5 13 7.07 13 9C13 10.93 11.43 12.5 9.5 12.5H4.5"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M5.5 5.5L3 3M5.5 5.5L3 8"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 4.5H13.5M6 4.5V3H10V4.5M5.5 4.5L6 13H10L10.5 4.5"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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

// ─── Tool button ─────────────────────────────────────────────────────────────

function ToolButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-md transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  )
}

// ─── Success view ─────────────────────────────────────────────────────────────

function SuccessView({ decision, designerName }: { decision: Decision; designerName: string }) {
  const approved = decision === 'approved'
  return (
    <div className="min-h-screen bg-[#FAF9F6] flex flex-col">
      <header className="bg-black px-8 py-5">
        <div className="max-w-7xl mx-auto">
          <h1 className="font-inter text-white text-xl font-semibold tracking-[0.3em] uppercase">
            Laher
          </h1>
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

// ─── Main component ───────────────────────────────────────────────────────────

export default function ReviewPage({ customerEmail, designerName, imageUrl, cardId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fabricCanvasRef = useRef<any>(null)
  const fabricModuleRef = useRef<any>(null)
  const bgImageRef = useRef<any>(null)

  // Refs for use inside Fabric event handlers (avoid stale closures)
  const toolRef = useRef<Tool>('select')
  const colorRef = useRef(PRESET_COLORS[0].hex)
  const sizeRef = useRef(3)
  const drawingRef = useRef(false)
  const shapeRef = useRef<any>(null)
  const originRef = useRef({ x: 0, y: 0 })
  const historyRef = useRef<string[]>([])

  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState(PRESET_COLORS[0].hex)
  const [size, setSize] = useState(3)
  const [feedback, setFeedback] = useState('')
  const [canvasReady, setCanvasReady] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [decision, setDecision] = useState<Decision | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Keep refs in sync
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { sizeRef.current = size }, [size])

  const saveHistory = useCallback(() => {
    const fc = fabricCanvasRef.current
    if (!fc) return
    const state = JSON.stringify(fc.toJSON())
    historyRef.current = [...historyRef.current.slice(-29), state]
  }, [])

  // ── Fabric.js initialisation ────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return
    let disposed = false

    ;(async () => {
      const { fabric } = await import('fabric')
      if (disposed) return

      fabricModuleRef.current = fabric

      const container = containerRef.current!
      const containerWidth = container.clientWidth

      const fc = new fabric.Canvas(canvasRef.current!, {
        preserveObjectStacking: true,
        selection: true,
      })
      fabricCanvasRef.current = fc

      const proxyUrl = `/api/proxy?url=${encodeURIComponent(imageUrl)}`

      fabric.Image.fromURL(
        proxyUrl,
        (img: any) => {
          if (disposed || !img) return

          const nw: number = img.width ?? 800
          const nh: number = img.height ?? 600
          const aspect = nw / nh

          const maxW = containerWidth
          const maxH = Math.floor(window.innerHeight * 0.68)

          let w = maxW
          let h = w / aspect
          if (h > maxH) { h = maxH; w = h * aspect }

          w = Math.floor(w)
          h = Math.floor(h)

          fc.setWidth(w)
          fc.setHeight(h)

          img.set({ originX: 'left', originY: 'top' })
          fc.setBackgroundImage(img, fc.renderAll.bind(fc), {
            scaleX: w / nw,
            scaleY: h / nh,
          })

          bgImageRef.current = img
          setCanvasReady(true)
        },
        { crossOrigin: 'anonymous' }
      )

      // ── Mouse events for shape tools ────────────────────────────────────────

      fc.on('mouse:down', (opt: any) => {
        const t = toolRef.current
        if (t === 'select' || t === 'draw') return

        const pointer = fc.getPointer(opt.e)

        if (t === 'text') {
          if (opt.target) return
          const itext = new fabric.IText('Type here', {
            left: pointer.x,
            top: pointer.y,
            fontSize: 18,
            fill: colorRef.current,
            fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
            editable: true,
            padding: 4,
          })
          fc.add(itext)
          fc.setActiveObject(itext)
          itext.enterEditing()
          itext.selectAll()
          fc.renderAll()
          return
        }

        drawingRef.current = true
        originRef.current = { x: pointer.x, y: pointer.y }

        if (t === 'rect') {
          shapeRef.current = new fabric.Rect({
            left: pointer.x,
            top: pointer.y,
            width: 1,
            height: 1,
            fill: 'transparent',
            stroke: colorRef.current,
            strokeWidth: sizeRef.current,
            selectable: false,
          })
        } else if (t === 'circle') {
          shapeRef.current = new fabric.Ellipse({
            left: pointer.x,
            top: pointer.y,
            rx: 1,
            ry: 1,
            fill: 'transparent',
            stroke: colorRef.current,
            strokeWidth: sizeRef.current,
            selectable: false,
          })
        }

        if (shapeRef.current) fc.add(shapeRef.current)
      })

      fc.on('mouse:move', (opt: any) => {
        if (!drawingRef.current || !shapeRef.current) return
        const pointer = fc.getPointer(opt.e)
        const { x: sx, y: sy } = originRef.current
        const dx = pointer.x - sx
        const dy = pointer.y - sy
        const t = toolRef.current

        if (t === 'rect') {
          shapeRef.current.set({
            left: dx < 0 ? pointer.x : sx,
            top: dy < 0 ? pointer.y : sy,
            width: Math.abs(dx),
            height: Math.abs(dy),
          })
        } else if (t === 'circle') {
          shapeRef.current.set({
            left: Math.min(sx, pointer.x),
            top: Math.min(sy, pointer.y),
            rx: Math.abs(dx) / 2,
            ry: Math.abs(dy) / 2,
          })
        }

        fc.renderAll()
      })

      fc.on('mouse:up', () => {
        if (!drawingRef.current) return
        drawingRef.current = false
        if (shapeRef.current) {
          shapeRef.current.set({ selectable: true })
          shapeRef.current = null
          saveHistory()
        }
      })

      fc.on('path:created', saveHistory)
      fc.on('object:modified', saveHistory)
    })()

    return () => {
      disposed = true
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.dispose()
        fabricCanvasRef.current = null
      }
    }
  }, [imageUrl, saveHistory])

  // ── Sync drawing mode when tool/color/size changes ─────────────────────────
  useEffect(() => {
    const fc = fabricCanvasRef.current
    if (!fc) return

    if (tool === 'draw') {
      fc.isDrawingMode = true
      fc.freeDrawingBrush.color = color
      fc.freeDrawingBrush.width = size
      fc.selection = false
    } else {
      fc.isDrawingMode = false
      fc.selection = tool === 'select' || tool === 'text'
    }
  }, [tool, color, size])

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleUndo = () => {
    const fc = fabricCanvasRef.current
    if (!fc) return
    const history = historyRef.current

    if (history.length === 0) {
      fc.getObjects().forEach((o: any) => fc.remove(o))
      fc.renderAll()
      return
    }

    const newHistory = history.slice(0, -1)
    historyRef.current = newHistory
    const prev = newHistory[newHistory.length - 1]

    if (!prev) {
      fc.getObjects().forEach((o: any) => fc.remove(o))
      fc.renderAll()
    } else {
      fc.loadFromJSON(prev, () => {
        // Re-apply background image after loadFromJSON
        if (bgImageRef.current) {
          fc.setBackgroundImage(bgImageRef.current, fc.renderAll.bind(fc))
        } else {
          fc.renderAll()
        }
      })
    }
  }

  const handleClear = () => {
    const fc = fabricCanvasRef.current
    if (!fc) return
    fc.getObjects().forEach((o: any) => fc.remove(o))
    fc.renderAll()
    historyRef.current = []
  }

  const handleSubmit = async (d: Decision) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const annotatedImage =
        fabricCanvasRef.current?.toDataURL({ format: 'png', multiplier: 1 }) ?? ''

      const webhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_URL
      if (!webhookUrl) throw new Error('Webhook URL is not configured.')

      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId,
          customerEmail,
          designerName,
          decision: d,
          feedback,
          annotatedImage,
          submittedAt: new Date().toISOString(),
        }),
      })

      if (!res.ok) throw new Error(`Server responded with ${res.status}.`)

      setDecision(d)
      setSubmitted(true)
    } catch (err: any) {
      setSubmitError(err?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Derived display name from email ───────────────────────────────────────
  const rawName = customerEmail.split('@')[0].replace(/[._-]/g, ' ')
  const displayName = rawName
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  if (submitted && decision) {
    return <SuccessView decision={decision} designerName={designerName} />
  }

  return (
    <div className="min-h-screen bg-[#FAF9F6]">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-black px-8 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="font-inter text-white text-xl font-semibold tracking-[0.3em] uppercase select-none">
            Laher
          </h1>
          <span
            className="text-white/40 text-xs tracking-widest uppercase"
            style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
          >
            Design Review
          </span>
        </div>
      </header>

      {/* ── Intro ──────────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 pt-8 pb-5">
        <h2 className="font-inter text-[1.6rem] font-light text-gray-900 leading-tight">
          Hello, {displayName}
        </h2>
        <p className="mt-1.5 text-gray-500 text-sm leading-relaxed" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
          <span className="text-gray-700 font-medium">{designerName}</span> has shared a design for
          your review. Annotate directly on the image, add written feedback, then submit your
          decision below.
        </p>
      </div>

      {/* ── Main layout ────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* ── Canvas column ───────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">

            {/* Annotation toolbar */}
            <div className="mb-3 flex flex-wrap items-center gap-2.5">

              {/* Tools */}
              <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                <ToolButton active={tool === 'select'} onClick={() => setTool('select')} title="Select / move objects">
                  <SelectIcon />
                </ToolButton>
                <ToolButton active={tool === 'draw'} onClick={() => setTool('draw')} title="Freehand draw">
                  <PencilIcon />
                </ToolButton>
                <ToolButton active={tool === 'rect'} onClick={() => setTool('rect')} title="Rectangle">
                  <RectIcon />
                </ToolButton>
                <ToolButton active={tool === 'circle'} onClick={() => setTool('circle')} title="Ellipse">
                  <CircleIcon />
                </ToolButton>
                <ToolButton active={tool === 'text'} onClick={() => setTool('text')} title="Add text">
                  <TextIcon />
                </ToolButton>
              </div>

              {/* Colour swatches */}
              <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-sm">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setColor(c.hex)}
                    title={c.label}
                    className={`w-5 h-5 rounded-full transition-all ${
                      color === c.hex
                        ? 'ring-2 ring-offset-1 ring-gray-500 scale-110'
                        : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
              </div>

              {/* Stroke size */}
              <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                {BRUSH_SIZES.map((bs) => (
                  <button
                    key={bs.value}
                    onClick={() => setSize(bs.value)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      size === bs.value
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {bs.label}
                  </button>
                ))}
              </div>

              {/* Undo / clear */}
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  onClick={handleUndo}
                  title="Undo last action"
                  className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  <UndoIcon />
                </button>
                <button
                  onClick={handleClear}
                  title="Clear all annotations"
                  className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors shadow-sm"
                >
                  <TrashIcon />
                </button>
              </div>
            </div>

            {/* Canvas wrapper */}
            <div
              ref={containerRef}
              className={`w-full overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-gray-100 canvas-tool-${tool}`}
            >
              {!canvasReady && (
                <div className="flex items-center justify-center h-96">
                  <div
                    className="text-gray-400 text-sm tracking-wide"
                    style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
                  >
                    Loading design…
                  </div>
                </div>
              )}
              <canvas ref={canvasRef} />
            </div>

            <p
              className="mt-2 text-xs text-gray-400"
              style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
            >
              Draw, add shapes, or annotate text directly on the image. Use the toolbar above to
              switch tools.
            </p>
          </div>

          {/* ── Feedback panel ──────────────────────────────────────────────── */}
          <div className="w-full lg:w-80 xl:w-96 flex-shrink-0 flex flex-col gap-4">

            {/* Written feedback */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-inter text-sm font-semibold text-gray-900 uppercase tracking-widest mb-3">
                Written Feedback
              </h3>
              <textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Add any notes or comments for your designer…"
                rows={7}
                className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:border-gray-400 focus:bg-white transition-colors leading-relaxed"
                style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
              />
            </div>

            {/* Submit */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-inter text-sm font-semibold text-gray-900 uppercase tracking-widest mb-1">
                Submit Review
              </h3>
              <p
                className="text-xs text-gray-400 mb-5 leading-relaxed"
                style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
              >
                Your annotations and feedback will be sent directly to {designerName}.
              </p>

              {submitError && (
                <p
                  className="text-xs text-red-500 mb-4 bg-red-50 border border-red-100 rounded-lg px-3 py-2"
                  style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
                >
                  {submitError}
                </p>
              )}

              <button
                onClick={() => handleSubmit('approved')}
                disabled={submitting || !canvasReady}
                className="w-full py-3.5 bg-gray-900 text-white rounded-lg font-inter text-sm font-medium tracking-wide hover:bg-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-3"
              >
                {submitting ? 'Submitting…' : 'Approve Design'}
              </button>

              <button
                onClick={() => handleSubmit('changes_requested')}
                disabled={submitting || !canvasReady}
                className="w-full py-3.5 border border-gray-300 text-gray-800 rounded-lg font-inter text-sm font-medium tracking-wide hover:border-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Request Changes
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
