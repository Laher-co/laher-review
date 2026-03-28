'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────────

type Tool = 'select' | 'draw' | 'text'
type Decision = 'approved' | 'changes_requested'

interface PathAnn {
  id: string
  type: 'path'
  points: { x: number; y: number }[]
  color: string
  lineWidth: number
}

interface TextAnn {
  id: string
  type: 'text'
  x: number   // left edge of text
  y: number   // top edge of text (NOT the canvas baseline)
  text: string
  color: string
  fontSize: number
}

type Ann = PathAnn | TextAnn

interface EditingText {
  id: string
  x: number
  y: number
  text: string
  color: string
  fontSize: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

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

const FONT_SIZE = 20
const HIT_RADIUS = 8   // px tolerance for path click detection
const SEL_PAD = 6      // px padding around selection box

interface Props {
  customerEmail: string
  designerName: string
  imageUrl: string
  cardId: string
}

// ── Utility ───────────────────────────────────────────────────────────────────

let _id = 0
const uid = () => `a${++_id}`

// Hit-test a click (px,py) against a path annotation
function hitPath(ann: PathAnn, px: number, py: number): boolean {
  const threshold = Math.max(ann.lineWidth / 2 + 4, HIT_RADIUS)
  const pts = ann.points
  for (let i = 0; i < pts.length; i++) {
    if (Math.hypot(pts[i].x - px, pts[i].y - py) <= threshold) return true
    if (i < pts.length - 1) {
      const ax = pts[i].x, ay = pts[i].y, bx = pts[i + 1].x, by = pts[i + 1].y
      const dx = bx - ax, dy = by - ay
      const len2 = dx * dx + dy * dy
      if (len2 > 0) {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
        if (Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= threshold) return true
      }
    }
  }
  return false
}

// Hit-test a click against a text annotation (needs ctx for text measurement)
function hitText(ctx: CanvasRenderingContext2D, ann: TextAnn, px: number, py: number): boolean {
  ctx.font = `${ann.fontSize}px Helvetica, Arial, sans-serif`
  const w = ctx.measureText(ann.text || 'W').width
  return px >= ann.x - 4 && px <= ann.x + w + 4
      && py >= ann.y - 4 && py <= ann.y + ann.fontSize + 4
}

// Deep-clone an annotation snapshot for history
function cloneAnn(a: Ann): Ann {
  if (a.type === 'path') return { ...a, points: a.points.map(p => ({ ...p })) }
  return { ...a }
}

// ── Icons ─────────────────────────────────────────────────────────────────────

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
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

// ── ToolButton ────────────────────────────────────────────────────────────────

function ToolButton({ active, onClick, title, children }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} title={title}
      className={`p-2 rounded-md transition-colors ${
        active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}>
      {children}
    </button>
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

  // ── Refs ───────────────────────────────────────────────────────────────────
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const bgImageRef   = useRef<HTMLImageElement | null>(null)

  // Annotation data — never stored in React state to avoid re-render overhead
  const annotationsRef = useRef<Ann[]>([])
  const selectedIdRef  = useRef<string | null>(null)
  // History: each entry is a full snapshot of annotationsRef at a point in time
  const historyRef     = useRef<Ann[][]>([])

  // Drawing state
  const isDrawingRef    = useRef(false)
  const currentPathRef  = useRef<PathAnn | null>(null)

  // Mirror refs for tool/color/size — read inside event handlers without stale closures
  const toolRef  = useRef<Tool>('select')
  const colorRef = useRef(PRESET_COLORS[0].hex)
  const sizeRef  = useRef(3)

  // Mirror ref for editingText — used inside commitText callback
  const editingTextRef = useRef<EditingText | null>(null)

  // ── React state (UI only) ─────────────────────────────────────────────────
  const [tool,        setTool]        = useState<Tool>('select')
  const [color,       setColor]       = useState(PRESET_COLORS[0].hex)
  const [size,        setSize]        = useState(3)
  const [canvasReady, setCanvasReady] = useState(false)
  const [editingText, setEditingText] = useState<EditingText | null>(null)
  const [feedback,    setFeedback]    = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [decision,    setDecision]    = useState<Decision | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Keep refs in sync with state
  useEffect(() => { toolRef.current  = tool  }, [tool])
  useEffect(() => { colorRef.current = color }, [color])
  useEffect(() => { sizeRef.current  = size  }, [size])
  useEffect(() => { editingTextRef.current = editingText }, [editingText])

  // ── Canvas drawing ────────────────────────────────────────────────────────

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (bgImageRef.current) ctx.drawImage(bgImageRef.current, 0, 0, canvas.width, canvas.height)

    for (const ann of annotationsRef.current) {
      if (ann.type === 'path') {
        paintPath(ctx, ann)
      } else {
        paintText(ctx, ann)
      }
      if (ann.id === selectedIdRef.current) {
        paintSelection(ctx, ann)
      }
    }
  }, [])

  function paintPath(ctx: CanvasRenderingContext2D, ann: PathAnn) {
    if (ann.points.length === 0) return
    ctx.save()
    ctx.strokeStyle = ann.color
    ctx.lineWidth   = ann.lineWidth
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.beginPath()
    ctx.moveTo(ann.points[0].x, ann.points[0].y)
    for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y)
    ctx.stroke()
    // dot for single-click
    if (ann.points.length === 1) {
      ctx.fillStyle = ann.color
      ctx.beginPath()
      ctx.arc(ann.points[0].x, ann.points[0].y, ann.lineWidth / 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  function paintText(ctx: CanvasRenderingContext2D, ann: TextAnn) {
    ctx.save()
    ctx.font         = `${ann.fontSize}px Helvetica, Arial, sans-serif`
    ctx.fillStyle    = ann.color
    ctx.textBaseline = 'top'   // ann.y is the TOP of the text
    ctx.fillText(ann.text, ann.x, ann.y)
    ctx.restore()
  }

  function paintSelection(ctx: CanvasRenderingContext2D, ann: Ann) {
    const b = annBounds(ctx, ann)
    if (!b) return
    ctx.save()
    ctx.strokeStyle = 'rgba(59,130,246,0.85)'
    ctx.lineWidth   = 1.5
    ctx.setLineDash([5, 3])
    ctx.strokeRect(b.x - SEL_PAD, b.y - SEL_PAD, b.w + SEL_PAD * 2, b.h + SEL_PAD * 2)
    ctx.restore()
  }

  function annBounds(ctx: CanvasRenderingContext2D, ann: Ann) {
    if (ann.type === 'path') {
      if (ann.points.length === 0) return null
      const xs = ann.points.map(p => p.x), ys = ann.points.map(p => p.y)
      const hw = ann.lineWidth / 2
      return { x: Math.min(...xs) - hw, y: Math.min(...ys) - hw,
               w: Math.max(...xs) - Math.min(...xs) + ann.lineWidth,
               h: Math.max(...ys) - Math.min(...ys) + ann.lineWidth }
    } else {
      ctx.font = `${ann.fontSize}px Helvetica, Arial, sans-serif`
      const w = ctx.measureText(ann.text || 'W').width
      return { x: ann.x, y: ann.y, w, h: ann.fontSize + 4 }
    }
  }

  // ── History ───────────────────────────────────────────────────────────────

  const saveHistory = useCallback(() => {
    const snapshot = annotationsRef.current.map(cloneAnn)
    historyRef.current = [...historyRef.current.slice(-29), snapshot]
  }, [])

  // ── Canvas initialisation ─────────────────────────────────────────────────

  useEffect(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    let disposed = false

    // ── Load background image ──────────────────────────────────────────────
    const img   = new Image()
    img.onload = () => {
      if (disposed) return
      bgImageRef.current = img

      const nw     = img.naturalWidth  || 800
      const nh     = img.naturalHeight || 600
      const aspect = nw / nh
      const maxW   = container.clientWidth
      const maxH   = Math.floor(window.innerHeight * 0.68)

      let w = maxW, h = w / aspect
      if (h > maxH) { h = maxH; w = h * aspect }
      canvas.width  = Math.floor(w)
      canvas.height = Math.floor(h)

      redraw()
      setCanvasReady(true)
    }
    img.onerror = () => {
      if (disposed) return
      canvas.width  = container.clientWidth
      canvas.height = 480
      setCanvasReady(true)
    }
    img.src = `/api/proxy?url=${encodeURIComponent(imageUrl)}`

    // ── Mouse helpers ──────────────────────────────────────────────────────
    function getPoint(e: MouseEvent) {
      const r  = canvas.getBoundingClientRect()
      const sx = canvas.width  / r.width
      const sy = canvas.height / r.height
      return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy }
    }

    function hitTest(px: number, py: number): string | null {
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      for (let i = annotationsRef.current.length - 1; i >= 0; i--) {
        const ann = annotationsRef.current[i]
        if (ann.type === 'path' && hitPath(ann, px, py)) return ann.id
        if (ann.type === 'text' && hitText(ctx, ann, px, py)) return ann.id
      }
      return null
    }

    // ── Mouse event handlers ───────────────────────────────────────────────
    function onMouseDown(e: MouseEvent) {
      const { x, y } = getPoint(e)
      const t = toolRef.current

      if (t === 'draw') {
        const path: PathAnn = {
          id: uid(), type: 'path',
          points: [{ x, y }],
          color: colorRef.current,
          lineWidth: sizeRef.current,
        }
        isDrawingRef.current   = true
        currentPathRef.current = path
        annotationsRef.current = [...annotationsRef.current, path]
        redraw()
        return
      }

      if (t === 'select') {
        selectedIdRef.current = hitTest(x, y)
        redraw()
        return
      }

      if (t === 'text') {
        // Commit any open text edit first
        commitTextImmediate()
        setEditingText({ id: uid(), x: Math.round(x), y: Math.round(y), text: '', color: colorRef.current, fontSize: FONT_SIZE })
        return
      }
    }

    function onMouseMove(e: MouseEvent) {
      if (!isDrawingRef.current || !currentPathRef.current) return
      const { x, y } = getPoint(e)
      currentPathRef.current.points.push({ x, y })
      redraw()
    }

    function onMouseUp() {
      if (!isDrawingRef.current || !currentPathRef.current) return
      isDrawingRef.current   = false
      currentPathRef.current = null
      saveHistory()
    }

    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    // Listen on window so mouseup outside canvas still ends the stroke
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      disposed = true
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [imageUrl, redraw, saveHistory])

  // ── Sync cursor and clear selection when tool changes ─────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.style.cursor =
      tool === 'draw' ? 'crosshair' :
      tool === 'text' ? 'text' : 'default'
    // Deselect when leaving select mode
    if (tool !== 'select' && selectedIdRef.current) {
      selectedIdRef.current = null
      redraw()
    }
  }, [tool, redraw])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleUndo = useCallback(() => {
    if (historyRef.current.length === 0) return
    const newHistory           = historyRef.current.slice(0, -1)
    historyRef.current         = newHistory
    annotationsRef.current     = newHistory.length > 0
      ? newHistory[newHistory.length - 1].map(cloneAnn)
      : []
    selectedIdRef.current      = null
    redraw()
  }, [redraw])

  const handleDeleteSelected = useCallback(() => {
    const id = selectedIdRef.current
    if (!id) return
    annotationsRef.current = annotationsRef.current.filter(a => a.id !== id)
    selectedIdRef.current  = null
    saveHistory()
    redraw()
  }, [redraw, saveHistory])

  // ── Text editing ──────────────────────────────────────────────────────────

  // Called when committing from outside React (e.g. new text click while editing)
  function commitTextImmediate() {
    const et = editingTextRef.current
    if (!et) return
    if (et.text.trim()) {
      annotationsRef.current = [...annotationsRef.current, {
        id: et.id, type: 'text' as const,
        x: et.x, y: et.y, text: et.text.trim(),
        color: et.color, fontSize: et.fontSize,
      }]
      saveHistory()
      redraw()
    }
    setEditingText(null)
  }

  const commitText = useCallback(() => {
    const et = editingTextRef.current
    if (!et) return
    if (et.text.trim()) {
      annotationsRef.current = [...annotationsRef.current, {
        id: et.id, type: 'text' as const,
        x: et.x, y: et.y, text: et.text.trim(),
        color: et.color, fontSize: et.fontSize,
      }]
      saveHistory()
      redraw()
    }
    setEditingText(null)
  }, [redraw, saveHistory])

  const cancelText = useCallback(() => {
    setEditingText(null)
  }, [])

  // ── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (d: Decision) => {
    // Commit any open text annotation before exporting
    commitTextImmediate()
    setSubmitting(true)
    setSubmitError(null)
    try {
      // Give React one tick to flush the text commit before toDataURL
      await new Promise(r => setTimeout(r, 50))
      const annotatedImage = canvasRef.current?.toDataURL('image/png') ?? ''
      const webhookUrl     = process.env.NEXT_PUBLIC_WEBHOOK_URL
      if (!webhookUrl) throw new Error('Webhook URL is not configured.')
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId, customerEmail, designerName, decision: d, feedback, annotatedImage, submittedAt: new Date().toISOString() }),
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

  // ── Derived display name ──────────────────────────────────────────────────

  const displayName = customerEmail.split('@')[0].replace(/[._-]/g, ' ')
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')

  if (submitted && decision) return <SuccessView decision={decision} designerName={designerName} />

  // ── Textarea position (CSS px, relative to canvas container) ─────────────
  // ann.y is text top; input top = ann.y; font-size matches canvas text
  const textareaStyle: React.CSSProperties = editingText ? {
    position:   'absolute',
    left:       editingText.x,
    top:        editingText.y,
    fontSize:   editingText.fontSize,
    fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
    color:      editingText.color,
    lineHeight: 1.2,
    background: 'rgba(255,255,255,0.12)',
    border:     '1px dashed currentColor',
    borderRadius: 2,
    outline:    'none',
    padding:    '1px 4px',
    minWidth:   100,
    zIndex:     10,
  } : {}

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FAF9F6]">

      {/* Header */}
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

      {/* Intro */}
      <div className="max-w-7xl mx-auto px-6 pt-8 pb-5">
        <h2 className="font-inter text-[1.6rem] font-light text-gray-900 leading-tight">
          Hello, {displayName}
        </h2>
        <p className="mt-1.5 text-gray-500 text-sm leading-relaxed"
          style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
          <span className="text-gray-700 font-medium">{designerName}</span> has shared a design for
          your review. Annotate directly on the image, add written feedback, then submit your decision below.
        </p>
      </div>

      {/* Main layout */}
      <div className="max-w-7xl mx-auto px-6 pb-16">
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* Canvas column */}
          <div className="flex-1 min-w-0">

            {/* Toolbar */}
            <div className="mb-3 flex flex-wrap items-center gap-2.5">

              {/* Tools */}
              <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                <ToolButton active={tool === 'select'} onClick={() => setTool('select')} title="Select / move objects">
                  <SelectIcon />
                </ToolButton>
                <ToolButton active={tool === 'draw'} onClick={() => setTool('draw')} title="Freehand draw">
                  <PencilIcon />
                </ToolButton>
                <ToolButton active={tool === 'text'} onClick={() => setTool('text')} title="Add text">
                  <TextIcon />
                </ToolButton>
              </div>

              {/* Colours */}
              <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 shadow-sm">
                {PRESET_COLORS.map(c => (
                  <button key={c.hex} onClick={() => setColor(c.hex)} title={c.label}
                    className={`w-5 h-5 rounded-full transition-all ${
                      color === c.hex ? 'ring-2 ring-offset-1 ring-gray-500 scale-110' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: c.hex }} />
                ))}
              </div>

              {/* Stroke size */}
              <div className="flex items-center gap-0.5 bg-white border border-gray-200 rounded-lg p-1 shadow-sm">
                {BRUSH_SIZES.map(bs => (
                  <button key={bs.value} onClick={() => setSize(bs.value)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      size === bs.value ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                    }`}>
                    {bs.label}
                  </button>
                ))}
              </div>

              {/* Undo / delete */}
              <div className="flex items-center gap-1.5 ml-auto">
                <button onClick={handleUndo} title="Undo last action"
                  className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors shadow-sm">
                  <UndoIcon />
                </button>
                <button onClick={handleDeleteSelected} title="Delete selected annotation"
                  className="p-2 rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors shadow-sm">
                  <TrashIcon />
                </button>
              </div>
            </div>

            {/* Canvas wrapper — position:relative so the text input can be positioned inside it */}
            <div ref={containerRef}
              className="w-full relative overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-gray-100">
              {!canvasReady && (
                <div className="flex items-center justify-center h-96">
                  <span className="text-gray-400 text-sm tracking-wide"
                    style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>Loading design…</span>
                </div>
              )}
              <canvas ref={canvasRef} style={{ display: 'block' }} />

              {/* Inline text input — appears on top of canvas when text tool is active */}
              {editingText && (
                <input
                  type="text"
                  autoFocus
                  value={editingText.text}
                  style={textareaStyle}
                  onChange={e => setEditingText(prev => prev ? { ...prev, text: e.target.value } : null)}
                  onBlur={commitText}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  { e.preventDefault(); commitText() }
                    if (e.key === 'Escape') { e.preventDefault(); cancelText() }
                  }}
                />
              )}
            </div>

            <p className="mt-2 text-xs text-gray-400" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
              Draw or add text annotations directly on the image. Use the toolbar above to switch tools.
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

              <button onClick={() => handleSubmit('approved')} disabled={submitting || !canvasReady}
                className="w-full py-3.5 bg-gray-900 text-white rounded-lg font-inter text-sm font-medium tracking-wide hover:bg-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed mb-3">
                {submitting ? 'Submitting…' : 'Approve Design'}
              </button>
              <button onClick={() => handleSubmit('changes_requested')} disabled={submitting || !canvasReady}
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
