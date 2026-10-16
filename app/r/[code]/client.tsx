'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import DrawingCanvas, {
  PEN_COLOURS, PEN_SIZES, renderDrawingJpeg, type DrawingHandle, type Stroke,
} from '@/components/DrawingCanvas'
import { Spinner } from '@/components/brand'
import { AU_RING_SIZES, CHANGE_AREAS, RING_SIZE_STATUS_LABEL, type ChangeArea } from '@/lib/feedback'
import { submitDecision, submitRingSize, uploadAnnotation } from './actions'

type Render = { id: string; url: string }
type Opt = { id: string; label: string; renders: Render[] }
type RingStatus = 'unconfirmed' | 'submitted' | 'confirmed'

const primary = 'flex w-full items-center justify-center gap-2 rounded-xl bg-cocoa px-5 py-4 text-[15px] font-medium tracking-wide text-ivory transition-colors hover:bg-cocoa-dark disabled:opacity-50'
const secondary = 'flex w-full items-center justify-center gap-2 rounded-xl border border-cocoa/40 bg-white px-5 py-4 text-[15px] font-medium tracking-wide text-cocoa transition-colors hover:bg-linen disabled:opacity-50'
const backBtn = 'flex items-center justify-center gap-1 rounded-xl border border-sand bg-white px-5 py-4 text-[15px] text-cocoa hover:bg-linen'

const newKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)

// ── Ring size bar ─────────────────────────────────────────────────────────────

function RingSizePicker({ value, onChange }: { value: string; onChange(v: string): void }) {
  const known = !value || AU_RING_SIZES.includes(value)
  const [other, setOther] = useState(!known)
  return (
    <>
      <select value={other ? 'other' : value}
        onChange={e => { if (e.target.value === 'other') { setOther(true); onChange('') } else { setOther(false); onChange(e.target.value) } }}
        className="w-full rounded-lg border border-sand bg-white px-3 py-3 text-base text-ink focus:border-cocoa focus:outline-none">
        <option value="">Choose a size (Australian)</option>
        {AU_RING_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        <option value="other">Another size or system (e.g. US 6)</option>
      </select>
      {other && (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="e.g. US 6½" maxLength={40}
          className="mt-2 w-full rounded-lg border border-sand px-3 py-3 text-base focus:border-cocoa focus:outline-none" />
      )}
    </>
  )
}

export function RingSizeBar({ code, size, status }: { code: string; size: string | null; status: RingStatus }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(size ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function send() {
    setError(null)
    start(async () => {
      const res = await submitRingSize(code, value)
      if (!res.ok) return setError(res.error)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div id="ring-size" className={`scroll-mt-4 border-b border-sand ${status === 'unconfirmed' ? 'bg-[#F6E9D9]' : 'bg-linen'} text-cocoa-dark`}>
      <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-sm">
            <span className="text-cocoa-light">Ring size</span>{' '}
            {size && status !== 'unconfirmed' && <strong className="font-semibold">{size}</strong>}{' '}
            <span className={`ml-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
              status === 'confirmed' ? 'bg-cocoa text-ivory' : status === 'submitted' ? 'border border-cocoa/30 text-cocoa' : 'bg-amber-700 text-white'}`}>
              {RING_SIZE_STATUS_LABEL[status]}
            </span>
          </p>
          {status !== 'confirmed' && !open && (
            <button onClick={() => setOpen(true)} className="text-sm font-medium text-cocoa underline underline-offset-4">
              {status === 'unconfirmed' ? 'Add my ring size' : 'Change'}
            </button>
          )}
        </div>
        {status === 'unconfirmed' && !open && (
          <p className="mt-1 text-xs text-cocoa-light">We need your finger size before your ring goes into production.</p>
        )}
        {open && (
          <div className="mt-3 rounded-xl border border-sand bg-white p-4">
            <p className="mb-2 text-sm font-medium text-ink">Your ring size</p>
            <RingSizePicker value={value} onChange={setValue} />
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={send} disabled={pending || !value.trim()}
                className="flex items-center gap-2 rounded-lg bg-cocoa px-4 py-2.5 text-sm text-ivory disabled:opacity-50">
                {pending && <Spinner />} Send my size
              </button>
              <button onClick={() => setOpen(false)} className="px-3 text-sm text-stone underline">Cancel</button>
            </div>
            <p className="mt-3 text-xs text-stone">Our team will confirm it with you before production.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sheet (full screen on phones, centred panel on desktop) ──────────────────

export function Sheet({ title, onClose, children, footer }: {
  title: string; onClose(): void; children: React.ReactNode; footer?: React.ReactNode
}) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-[100dvh] w-full flex-col bg-ivory sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-2xl sm:shadow-xl">
        <div className="flex items-center justify-between border-b border-sand px-4 py-3 sm:px-6">
          <h2 className="font-serif text-xl text-cocoa-dark">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-2xl text-stone hover:bg-linen">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
        {footer && <div className="border-t border-sand bg-ivory px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</div>}
      </div>
    </div>
  )
}

function Steps({ total, current }: { total: number; current: number }) {
  return (
    <div className="mb-5 flex gap-1.5" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-1 flex-1 rounded-full ${i <= current ? 'bg-cocoa' : 'bg-sand'}`} />
      ))}
    </div>
  )
}

function Done({ title, body, onClose }: { title: string; body: string; onClose(): void }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-cocoa text-2xl text-ivory">✓</div>
      <h3 className="mt-5 font-serif text-2xl text-cocoa-dark">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-stone">{body}</p>
      <button onClick={onClose} className="mt-8 text-sm font-medium text-cocoa underline underline-offset-4">Back to my design</button>
    </div>
  )
}

// ── Approve (one button per option) ──────────────────────────────────────────

export function ApproveButton(props: {
  code: string
  designer: string
  ringSizeStatus: RingStatus
  version: { id: string; title: string }
  option: { id: string; label: string; cover: string | null }
  optionCount: number
}) {
  const [open, setOpen] = useState(false)
  const label = props.optionCount > 1 ? `Approve Option ${props.option.label}` : 'Approve this design'
  return (
    <>
      <button className={`${primary} mt-4`} onClick={() => setOpen(true)}>{label}</button>
      {open && <ApproveSheet {...props} onClose={() => setOpen(false)} />}
    </>
  )
}

function ApproveSheet({ code, designer, ringSizeStatus, version, option, optionCount, onClose }:
  Parameters<typeof ApproveButton>[0] & { onClose(): void }) {
  const router = useRouter()
  const needsSize = ringSizeStatus === 'unconfirmed'
  const [size, setSize] = useState('')
  const [notSure, setNotSure] = useState(false)
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<null | 'approved' | 'size_outstanding'>(null)
  const [pending, start] = useTransition()
  const clientKey = useRef(newKey())
  const what = `${version.title}${optionCount > 1 ? `, Option ${option.label}` : ''}`
  const ready = !needsSize || notSure || size.trim()

  const close = () => { if (done) router.refresh(); onClose() }

  function confirm() {
    setError(null)
    start(async () => {
      const res = await submitDecision(code, {
        clientKey: clientKey.current, versionId: version.id, decision: 'approved', optionId: option.id,
        changes: [], comments, annotations: [],
        ringSize: !needsSize ? undefined : notSure ? { notSure: true } : { size },
      })
      if (!res.ok) return setError(res.error)
      setDone(needsSize && notSure ? 'size_outstanding' : 'approved')
    })
  }

  if (done) {
    return (
      <Sheet title="Approved" onClose={close}>
        <Done title="Thank you!" onClose={close} body={done === 'size_outstanding'
          ? `We’ve recorded your approval of ${what}. Our team will be in touch to help you confirm your ring size, then ${designer} will prepare it for production.`
          : `You’ve approved ${what}. ${designer} will prepare your design for production, and we’ll be in touch about the next steps.`} />
      </Sheet>
    )
  }

  return (
    <Sheet title="Confirm your approval" onClose={close}
      footer={
        <div className="space-y-2">
          {error && <p className="text-sm text-red-700">{error}</p>}
          <button className={primary} disabled={pending || !ready} onClick={confirm}>
            {pending && <Spinner />} Confirm approval
          </button>
          <button className={`${backBtn} w-full`} onClick={close}>← Back</button>
        </div>
      }>
      {option.cover && (
        <div className="relative mb-5 aspect-[4/3] overflow-hidden rounded-xl border border-sand bg-white">
          <Image src={option.cover} alt="" fill sizes="(min-width: 640px) 560px, 100vw" className="object-contain" />
        </div>
      )}
      <p className="font-serif text-2xl leading-snug text-cocoa-dark">You’re approving {what}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-stone">Once you confirm, {designer} will prepare it for production.</p>

      {needsSize && (
        <div className="mt-6 rounded-xl border border-sand bg-white p-4">
          <p className="text-[15px] font-medium text-ink">What’s your ring size?</p>
          <p className="mb-3 mt-0.5 text-sm text-stone">We need it before your ring can go into production.</p>
          {!notSure && <RingSizePicker value={size} onChange={setSize} />}
          <label className="mt-3 flex cursor-pointer items-center gap-3 text-[15px] text-ink">
            <input type="checkbox" checked={notSure} onChange={e => setNotSure(e.target.checked)}
              className="h-5 w-5 rounded border-sand accent-[#4A3022]" />
            Not sure of my size
          </label>
          {notSure && (
            <p className="mt-2 text-sm text-cocoa-light">No problem. We’ll record your approval and our team will help you confirm your size before production starts.</p>
          )}
        </div>
      )}

      <label className="mt-5 block">
        <span className="text-sm font-medium text-ink">Anything to add? <span className="font-normal text-stone">(optional)</span></span>
        <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3} maxLength={4000}
          className="mt-2 w-full rounded-xl border border-sand bg-white px-3 py-3 text-base focus:border-cocoa focus:outline-none" />
      </label>
    </Sheet>
  )
}

// ── Request changes (one button per version) ─────────────────────────────────

// Kept on the device until sent, so closing the sheet or reloading the page
// doesn't lose what the customer typed or drew. Drawings are stored as strokes.
type Draft = {
  step: number
  optionId: string | null
  areas: ChangeArea[]
  notes: Partial<Record<ChangeArea, string>>
  drawings: Record<string, Stroke[]>   // renderId → strokes
  comments: string
  clientKey: string
}
const emptyDraft = (optionId: string | null): Draft =>
  ({ step: 0, optionId, areas: [], notes: {}, drawings: {}, comments: '', clientKey: newKey() })

function useDraft(storageKey: string, initial: () => Draft) {
  const [draft, setDraft] = useState<Draft>(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return { ...initial(), ...JSON.parse(saved) }
    } catch {}
    return initial()
  })
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(draft)) } catch {}
  }, [storageKey, draft])
  const clear = useCallback(() => { try { localStorage.removeItem(storageKey) } catch {} }, [storageKey])
  return [draft, setDraft, clear] as const
}

function hasContent(d: Draft) {
  return d.areas.length > 0 || Object.values(d.notes).some(n => n?.trim()) || Object.keys(d.drawings).length > 0 || d.comments.trim() !== ''
}

export function RequestChangesButton(props: {
  code: string; designer: string; version: { id: string; title: string }; options: Opt[]
}) {
  const [open, setOpen] = useState(false)
  const [hasDraft, setHasDraft] = useState(false)
  const key = `laher-review-draft:${props.code}:${props.version.id}`
  useEffect(() => {
    try { const s = localStorage.getItem(key); setHasDraft(!!s && hasContent(JSON.parse(s))) } catch {}
  }, [key, open])
  return (
    <>
      <button className={`${secondary} mt-6`} onClick={() => setOpen(true)}>
        {hasDraft ? `Continue your changes to ${props.version.title}` : `Request changes to ${props.version.title}`}
      </button>
      {open && <ChangesFlow {...props} storageKey={key} onClose={() => setOpen(false)} />}
    </>
  )
}

function ChangesFlow({ code, designer, version, options, storageKey, onClose }:
  Parameters<typeof RequestChangesButton>[0] & { storageKey: string; onClose(): void }) {
  const router = useRouter()
  const multi = options.length > 1
  const steps = [...(multi ? ['option'] : []), 'areas', 'details', 'draw', 'review'] as const
  const [draft, setDraft, clearDraft] = useDraft(storageKey, () => emptyDraft(multi ? null : options[0]?.id ?? null))
  const update = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }))
  const i = Math.min(draft.step, steps.length - 1)
  const step = steps[i]

  const [editing, setEditing] = useState<Render | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  const option = options.find(o => o.id === draft.optionId)
  const drawable = option?.renders ?? []
  const allRenders = options.flatMap(o => o.renders)

  // Rebuild drawing thumbnails from saved strokes (e.g. after a reload)
  useEffect(() => {
    let cancelled = false
    for (const [renderId, strokes] of Object.entries(draft.drawings)) {
      if (previews[renderId]) continue
      const r = allRenders.find(x => x.id === renderId)
      if (!r) continue
      renderDrawingJpeg(r.url, strokes).then(b => {
        if (b && !cancelled) setPreviews(p => ({ ...p, [renderId]: URL.createObjectURL(b) }))
      })
    }
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.drawings])

  const close = () => { if (done) router.refresh(); onClose() }
  const back = () => (i === 0 ? close() : update({ step: i - 1 }))

  const canNext =
    step === 'option'  ? !!draft.optionId :
    step === 'areas'   ? draft.areas.length > 0 :
    step === 'details' ? draft.areas.every(a => (draft.notes[a] ?? '').trim()) :
    true

  function send() {
    setError(null)
    start(async () => {
      try {
        // Only drawings on the chosen option's renders are sent
        const annotations = []
        for (const r of drawable) {
          const strokes = draft.drawings[r.id]
          if (!strokes?.length) continue
          const jpeg = await renderDrawingJpeg(r.url, strokes)
          if (!jpeg) throw new Error('One of your drawings couldn’t be prepared. Please try again.')
          const form = new FormData()
          form.set('renderId', r.id)
          form.set('file', jpeg, 'drawing.jpg')
          const up = await uploadAnnotation(code, form)
          if ('error' in up) throw new Error(up.error)
          annotations.push({ renderId: r.id, drawingUrl: up.drawingUrl, strokes })
        }
        const res = await submitDecision(code, {
          clientKey: draft.clientKey, versionId: version.id, decision: 'changes_requested', optionId: draft.optionId,
          changes: draft.areas.map(a => ({ area: a, note: (draft.notes[a] ?? '').trim() })),
          comments: draft.comments, annotations,
        })
        if (!res.ok) throw new Error(res.error)
        clearDraft()
        setDone(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      }
    })
  }

  if (done) {
    return (
      <Sheet title="Changes sent" onClose={close}>
        <Done title="Thank you!" onClose={close}
          body={`${designer} has your notes on ${version.title}${multi && option ? `, Option ${option.label}` : ''} and will get started on your next version. We’ll email you when it’s ready.`} />
      </Sheet>
    )
  }

  if (editing) {
    return (
      <DrawEditor render={editing} initial={draft.drawings[editing.id]}
        onCancel={() => setEditing(null)}
        onSave={(strokes, preview) => {
          const drawings = { ...draft.drawings }
          if (strokes.length) drawings[editing.id] = strokes
          else delete drawings[editing.id]
          setPreviews(p => {
            const next = { ...p }
            if (preview) next[editing.id] = preview
            else delete next[editing.id]
            return next
          })
          update({ drawings })
          setEditing(null)
        }} />
    )
  }

  const drawnHere = drawable.filter(r => draft.drawings[r.id]?.length).length
  const title = `Changes to ${version.title}`

  const footer = step === 'review'
    ? <div className="space-y-2">
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className={primary} disabled={pending} onClick={send}>{pending && <Spinner />} Send to {designer}</button>
        <button className={`${backBtn} w-full`} onClick={back} disabled={pending}>← Back</button>
      </div>
    : <div className="flex gap-3">
        <button className={backBtn} onClick={back}>← Back</button>
        <button className={primary} disabled={!canNext} onClick={() => update({ step: i + 1 })}>
          {step === 'draw' && drawnHere === 0 ? 'Skip' : 'Continue'}
        </button>
      </div>

  return (
    <Sheet title={title} onClose={close} footer={footer}>
      <Steps total={steps.length} current={i} />

      {step === 'option' && (
        <>
          <p className="mb-4 text-[15px] text-ink">Which option would you like changed?</p>
          <div className="grid grid-cols-2 gap-3">
            {options.map(o => (
              <button key={o.id} type="button" onClick={() => update({ optionId: o.id })} aria-pressed={draft.optionId === o.id}
                className={`overflow-hidden rounded-xl border-2 bg-white text-left transition-colors ${draft.optionId === o.id ? 'border-cocoa' : 'border-sand'}`}>
                {o.renders[0] && (
                  <span className="relative block aspect-square bg-linen">
                    <Image src={o.renders[0].url} alt="" fill sizes="45vw" className="object-cover" />
                  </span>
                )}
                <span className="block px-3 py-2.5 font-serif text-lg text-cocoa-dark">Option {o.label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'areas' && (
        <>
          <p className="mb-4 text-[15px] text-ink">What would you like to change? Choose all that apply.</p>
          <div className="flex flex-wrap gap-2">
            {CHANGE_AREAS.map(a => {
              const on = draft.areas.includes(a.key)
              return (
                <button key={a.key} type="button" aria-pressed={on}
                  onClick={() => setDraft(d => ({ ...d, areas: d.areas.includes(a.key) ? d.areas.filter(x => x !== a.key) : [...d.areas, a.key] }))}
                  className={`rounded-full border px-5 py-3 text-[15px] transition-colors ${on ? 'border-cocoa bg-cocoa text-ivory' : 'border-sand bg-white text-ink'}`}>
                  {a.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {step === 'details' && (
        <div className="space-y-5">
          <p className="text-[15px] text-ink">Tell {designer} what you’d like. A few words is plenty.</p>
          {CHANGE_AREAS.filter(a => draft.areas.includes(a.key)).map(a => (
            <label key={a.key} className="block">
              <span className="font-serif text-lg text-cocoa-dark">{a.label}</span>
              <textarea value={draft.notes[a.key] ?? ''} rows={3} maxLength={2000} placeholder={a.prompt}
                onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, notes: { ...d.notes, [a.key]: v } })) }}
                className="mt-1.5 w-full rounded-xl border border-sand bg-white px-3 py-3 text-base focus:border-cocoa focus:outline-none" />
            </label>
          ))}
        </div>
      )}

      {step === 'draw' && (
        <>
          <p className="text-[15px] text-ink">Want to show us? <span className="text-stone">(optional)</span></p>
          <p className="mb-4 mt-1 text-sm text-stone">Tap an image to draw on it, e.g. circle the part you’d like changed.</p>
          <div className="grid grid-cols-2 gap-3">
            {drawable.map(r => {
              const drawn = !!draft.drawings[r.id]?.length
              return (
                <button key={r.id} type="button" onClick={() => setEditing(r)}
                  className="relative aspect-square overflow-hidden rounded-xl border-2 border-sand bg-white">
                  {drawn && previews[r.id]
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={previews[r.id]} alt="Your drawing" className="h-full w-full object-cover" />
                    : <Image src={r.url} alt="" fill sizes="45vw" className="object-cover" />}
                  <span className={`absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-xs ${drawn ? 'bg-cocoa text-ivory' : 'bg-white/90 text-cocoa'}`}>
                    {drawn ? 'Drawn ✓ · Edit' : 'Draw'}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}

      {step === 'review' && (
        <div className="space-y-5">
          <p className="text-[15px] text-ink">Here’s what we’ll send to {designer}:</p>
          <div className="rounded-xl border border-sand bg-white p-4 text-[15px]">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-cocoa-light">
              {version.title}{multi && option ? `, Option ${option.label}` : ''}
            </p>
            <ul className="space-y-1.5">
              {CHANGE_AREAS.filter(a => draft.areas.includes(a.key)).map(a => (
                <li key={a.key}><span className="font-medium text-cocoa">{a.label}:</span> {draft.notes[a.key]}</li>
              ))}
            </ul>
            {drawnHere > 0 && <p className="mt-2 text-stone">{drawnHere} drawing{drawnHere > 1 ? 's' : ''} attached</p>}
          </div>
          <label className="block">
            <span className="text-sm font-medium text-ink">Anything else? <span className="font-normal text-stone">(optional)</span></span>
            <textarea value={draft.comments} onChange={e => update({ comments: e.target.value })} rows={3} maxLength={4000}
              className="mt-2 w-full rounded-xl border border-sand bg-white px-3 py-3 text-base focus:border-cocoa focus:outline-none" />
          </label>
        </div>
      )}
    </Sheet>
  )
}

export function DrawEditor({ render, initial, onSave, onCancel }: {
  render: Render; initial?: Stroke[]; onSave(strokes: Stroke[], preview: string | null): void; onCancel(): void
}) {
  const ref = useRef<DrawingHandle>(null)
  const [colour, setColour] = useState(PEN_COLOURS[0].hex)
  const [size, setSize] = useState(PEN_SIZES[1].px)
  const [count, setCount] = useState(initial?.length ?? 0)
  const [saving, setSaving] = useState(false)

  async function save() {
    const h = ref.current
    if (!h) return
    const strokes = h.strokes()
    if (strokes.length === 0) return onSave([], null)
    setSaving(true)
    const jpeg = await h.exportJpeg()
    setSaving(false)
    onSave(strokes, jpeg ? URL.createObjectURL(jpeg) : null)
  }

  return (
    <Sheet title="Draw on the design" onClose={onCancel}
      footer={
        <div className="flex gap-3">
          <button className={backBtn} onClick={onCancel}>← Back</button>
          <button className={primary} disabled={saving} onClick={save}>{saving && <Spinner />} {count ? 'Done' : 'Back without drawing'}</button>
        </div>
      }>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-sand bg-white px-2.5 py-2">
          {PEN_COLOURS.map(c => (
            <button key={c.hex} type="button" aria-label={c.label} onClick={() => setColour(c.hex)}
              className={`h-7 w-7 rounded-full border border-black/15 ${colour === c.hex ? 'ring-2 ring-cocoa ring-offset-2' : ''}`}
              style={{ backgroundColor: c.hex }} />
          ))}
        </div>
        <div className="flex rounded-full border border-sand bg-white p-1">
          {PEN_SIZES.map(s => (
            <button key={s.label} type="button" onClick={() => setSize(s.px)}
              className={`h-8 w-9 rounded-full text-xs font-medium ${size === s.px ? 'bg-cocoa text-ivory' : 'text-stone'}`}>{s.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => ref.current?.undo()} disabled={!count}
          className="ml-auto rounded-full border border-sand bg-white px-4 py-2 text-sm text-cocoa disabled:opacity-40">Undo</button>
        <button type="button" onClick={() => ref.current?.clear()} disabled={!count}
          className="rounded-full border border-sand bg-white px-4 py-2 text-sm text-cocoa disabled:opacity-40">Clear</button>
      </div>
      <DrawingCanvas ref={ref} src={render.url} colour={colour} size={size} initial={initial} onChange={setCount} />
      <p className="mt-2 text-center text-xs text-stone">Draw with your finger, or with your mouse on a computer.</p>
    </Sheet>
  )
}
