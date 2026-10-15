'use client'

import Image from 'next/image'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import DrawingCanvas, { PEN_COLOURS, PEN_SIZES, type DrawingHandle, type Stroke } from '@/components/DrawingCanvas'
import { Spinner } from '@/components/brand'
import { AU_RING_SIZES, CHANGE_AREAS, RING_SIZE_STATUS_LABEL, type ChangeArea } from '@/lib/feedback'
import { submitDecision, submitRingSize, uploadAnnotation } from './actions'

type Render = { id: string; url: string }
type Opt = { id: string; label: string; renders: Render[] }

const primary = 'flex w-full items-center justify-center gap-2 rounded-xl bg-cocoa px-5 py-4 text-[15px] font-medium tracking-wide text-ivory transition-colors hover:bg-cocoa-dark disabled:opacity-50'
const secondary = 'flex w-full items-center justify-center gap-2 rounded-xl border border-cocoa/40 bg-white px-5 py-4 text-[15px] font-medium tracking-wide text-cocoa transition-colors hover:bg-linen disabled:opacity-50'

// ── Ring size bar ─────────────────────────────────────────────────────────────

export function RingSizeBar({ code, size, status }: {
  code: string; size: string | null; status: 'unconfirmed' | 'submitted' | 'confirmed'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState(size && AU_RING_SIZES.includes(size) ? size : '')
  const [other, setOther] = useState(size && !AU_RING_SIZES.includes(size) ? size : '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const tone = status === 'confirmed' ? 'bg-linen text-cocoa-dark' : status === 'submitted' ? 'bg-linen text-cocoa-dark' : 'bg-[#F6E9D9] text-cocoa-dark'

  function send() {
    const value = choice === 'other' ? other : choice
    setError(null)
    start(async () => {
      const res = await submitRingSize(code, value)
      if (!res.ok) return setError(res.error)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className={`border-b border-sand ${tone}`}>
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
            <label className="block text-sm font-medium text-ink" htmlFor="ring-size">Your ring size (Australian)</label>
            <select id="ring-size" value={choice} onChange={e => setChoice(e.target.value)}
              className="mt-2 w-full rounded-lg border border-sand bg-white px-3 py-3 text-base text-ink focus:border-cocoa focus:outline-none">
              <option value="">Choose a size</option>
              {AU_RING_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
              <option value="other">Another size or system (e.g. US 6)</option>
            </select>
            {choice === 'other' && (
              <input value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. US 6½" maxLength={40}
                className="mt-2 w-full rounded-lg border border-sand px-3 py-3 text-base focus:border-cocoa focus:outline-none" />
            )}
            {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
            <div className="mt-3 flex gap-2">
              <button onClick={send} disabled={pending || !(choice === 'other' ? other.trim() : choice)}
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

function Sheet({ title, onClose, children, footer }: {
  title: string; onClose(): void; children: React.ReactNode; footer?: React.ReactNode
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [onClose])

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

function OptionPicker({ options, value, onChange, allowUnsure }: {
  options: Opt[]; value: string | null; onChange(id: string | null): void; allowUnsure?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map(o => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)}
          className={`overflow-hidden rounded-xl border-2 bg-white text-left transition-colors ${value === o.id ? 'border-cocoa' : 'border-sand'}`}>
          {o.renders[0] && (
            <span className="relative block aspect-square bg-linen">
              <Image src={o.renders[0].url} alt="" fill sizes="45vw" className="object-cover" />
            </span>
          )}
          <span className="block px-3 py-2.5 font-serif text-lg text-cocoa-dark">Option {o.label}</span>
        </button>
      ))}
      {allowUnsure && (
        <button type="button" onClick={() => onChange(null)}
          className={`col-span-2 rounded-xl border-2 bg-white px-4 py-3 text-left text-[15px] ${value === null ? 'border-cocoa' : 'border-sand'}`}>
          Not sure / a mix of options
        </button>
      )}
    </div>
  )
}

// ── Decision panel ────────────────────────────────────────────────────────────

export function DecisionPanel(props: {
  code: string
  designer: string
  ringSizeConfirmed: boolean
  version: { id: string; title: string }
  options: Opt[]
}) {
  const [flow, setFlow] = useState<null | 'approve' | 'changes'>(null)
  return (
    <section className="mt-10 rounded-2xl border border-sand bg-white/80 p-5 sm:p-6">
      <h2 className="font-serif text-2xl text-cocoa-dark">What do you think?</h2>
      <p className="mt-1 text-[15px] text-stone">
        Happy with {props.version.title}? Approve it. Or tell {props.designer} what you’d like changed.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button className={primary} onClick={() => setFlow('approve')}>Approve design</button>
        <button className={secondary} onClick={() => setFlow('changes')}>Request changes</button>
      </div>
      {flow === 'approve' && <ApproveFlow {...props} onClose={() => setFlow(null)} />}
      {flow === 'changes' && <ChangesFlow {...props} onClose={() => setFlow(null)} />}
    </section>
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

// ── Approve ───────────────────────────────────────────────────────────────────

function ApproveFlow({ code, designer, ringSizeConfirmed, version, options, onClose }: Parameters<typeof DecisionPanel>[0] & { onClose(): void }) {
  const router = useRouter()
  const multi = options.length > 1
  const [step, setStep] = useState(multi ? 0 : 1)
  const [optionId, setOptionId] = useState<string | null>(multi ? null : options[0]?.id ?? null)
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()
  const chosen = options.find(o => o.id === optionId)

  const close = () => { if (done) router.refresh(); onClose() }

  function approve() {
    setError(null)
    start(async () => {
      const res = await submitDecision(code, {
        versionId: version.id, decision: 'approved', optionId, changes: [], comments, annotations: [],
      })
      if (!res.ok) return setError(res.error)
      setDone(true)
    })
  }

  if (done) {
    return (
      <Sheet title="Approved" onClose={close}>
        <Done title="Thank you!" onClose={close}
          body={`${designer} will prepare your design for production. We’ll be in touch about the next steps.`} />
      </Sheet>
    )
  }

  return (
    <Sheet title={`Approve ${version.title}`} onClose={close}
      footer={step === 0
        ? <button className={primary} disabled={!optionId} onClick={() => setStep(1)}>Continue</button>
        : <div className="space-y-2">
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button className={primary} disabled={pending} onClick={approve}>
              {pending && <Spinner />} Approve {chosen && multi ? `Option ${chosen.label}` : 'this design'}
            </button>
            {multi && <button className="w-full py-2 text-sm text-stone underline" onClick={() => setStep(0)}>Choose a different option</button>}
          </div>}>
      {multi && <Steps total={2} current={step} />}
      {step === 0 ? (
        <>
          <p className="mb-4 text-[15px] text-ink">Which option would you like to go ahead with?</p>
          <OptionPicker options={options} value={optionId} onChange={setOptionId} />
        </>
      ) : (
        <>
          {chosen?.renders[0] && (
            <div className="relative mb-5 aspect-[4/3] overflow-hidden rounded-xl border border-sand bg-white">
              <Image src={chosen.renders[0].url} alt="" fill sizes="(min-width: 640px) 560px, 100vw" className="object-contain" />
            </div>
          )}
          <p className="text-[15px] leading-relaxed text-ink">
            You’re approving <strong>{version.title}{chosen && multi ? `, Option ${chosen.label}` : ''}</strong>.
            {' '}{designer} will then prepare it for production.
          </p>
          {!ringSizeConfirmed && (
            <p className="mt-3 rounded-lg bg-[#F6E9D9] px-3 py-2 text-sm text-cocoa-dark">
              We’ll still need to confirm your ring size before production. You can add it at the top of the page.
            </p>
          )}
          <label className="mt-5 block">
            <span className="text-sm font-medium text-ink">Anything to add? <span className="font-normal text-stone">(optional)</span></span>
            <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3} maxLength={4000}
              className="mt-2 w-full rounded-xl border border-sand bg-white px-3 py-3 text-base focus:border-cocoa focus:outline-none" />
          </label>
        </>
      )}
    </Sheet>
  )
}

// ── Request changes ───────────────────────────────────────────────────────────

type Drawing = { strokes: Stroke[]; jpeg: Blob; preview: string }

function ChangesFlow({ code, designer, version, options, onClose }: Parameters<typeof DecisionPanel>[0] & { onClose(): void }) {
  const router = useRouter()
  const multi = options.length > 1
  const steps = [...(multi ? ['option'] : []), 'areas', 'details', 'draw', 'review'] as const
  const [i, setI] = useState(0)
  const step = steps[i]

  const [optionId, setOptionId] = useState<string | null>(multi ? null : options[0]?.id ?? null)
  const [areas, setAreas] = useState<ChangeArea[]>([])
  const [notes, setNotes] = useState<Partial<Record<ChangeArea, string>>>({})
  const [drawings, setDrawings] = useState<Record<string, Drawing>>({})
  const [editing, setEditing] = useState<Render | null>(null)
  const [comments, setComments] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [pending, start] = useTransition()

  const close = () => { if (done) router.refresh(); onClose() }
  const drawable = optionId ? options.find(o => o.id === optionId)!.renders : options.flatMap(o => o.renders)

  const canNext =
    step === 'areas'   ? areas.length > 0 :
    step === 'details' ? areas.every(a => (notes[a] ?? '').trim()) :
    true

  function send() {
    setError(null)
    start(async () => {
      try {
        const annotations = []
        for (const [renderId, d] of Object.entries(drawings)) {
          const form = new FormData()
          form.set('renderId', renderId)
          form.set('file', d.jpeg, 'drawing.jpg')
          const up = await uploadAnnotation(code, form)
          if ('error' in up) throw new Error(up.error)
          annotations.push({ renderId, drawingUrl: up.drawingUrl, strokes: d.strokes })
        }
        const res = await submitDecision(code, {
          versionId: version.id, decision: 'changes_requested', optionId,
          changes: areas.map(a => ({ area: a, note: (notes[a] ?? '').trim() })),
          comments, annotations,
        })
        if (!res.ok) throw new Error(res.error)
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
          body={`${designer} has your notes and will get started on your next version. We’ll email you when it’s ready.`} />
      </Sheet>
    )
  }

  if (editing) {
    return (
      <DrawEditor render={editing} initial={drawings[editing.id]?.strokes}
        onCancel={() => setEditing(null)}
        onSave={d => {
          setDrawings(prev => {
            const next = { ...prev }
            if (d) next[editing.id] = d
            else delete next[editing.id]
            return next
          })
          setEditing(null)
        }} />
    )
  }

  const footer = step === 'review'
    ? <div className="space-y-2">
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button className={primary} disabled={pending} onClick={send}>{pending && <Spinner />} Send to {designer}</button>
        <button className="w-full py-2 text-sm text-stone underline" onClick={() => setI(i - 1)}>Back</button>
      </div>
    : <div className="flex gap-3">
        {i > 0 && <button className={`${secondary} w-auto px-6`} onClick={() => setI(i - 1)}>Back</button>}
        <button className={primary} disabled={!canNext} onClick={() => setI(i + 1)}>
          {step === 'draw' && Object.keys(drawings).length === 0 ? 'Skip' : 'Continue'}
        </button>
      </div>

  return (
    <Sheet title="Request changes" onClose={close} footer={footer}>
      <Steps total={steps.length} current={i} />

      {step === 'option' && (
        <>
          <p className="mb-4 text-[15px] text-ink">Which option is closest to what you’d like?</p>
          <OptionPicker options={options} value={optionId} onChange={setOptionId} allowUnsure />
        </>
      )}

      {step === 'areas' && (
        <>
          <p className="mb-4 text-[15px] text-ink">What would you like to change? Choose all that apply.</p>
          <div className="flex flex-wrap gap-2">
            {CHANGE_AREAS.map(a => {
              const on = areas.includes(a.key)
              return (
                <button key={a.key} type="button" aria-pressed={on}
                  onClick={() => setAreas(prev => prev.includes(a.key) ? prev.filter(x => x !== a.key) : [...prev, a.key])}
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
          {CHANGE_AREAS.filter(a => areas.includes(a.key)).map(a => (
            <label key={a.key} className="block">
              <span className="font-serif text-lg text-cocoa-dark">{a.label}</span>
              <textarea value={notes[a.key] ?? ''} rows={3} maxLength={2000} placeholder={a.prompt}
                onChange={e => { const v = e.target.value; setNotes(prev => ({ ...prev, [a.key]: v })) }}
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
              const d = drawings[r.id]
              return (
                <button key={r.id} type="button" onClick={() => setEditing(r)}
                  className="relative aspect-square overflow-hidden rounded-xl border-2 border-sand bg-white">
                  {d
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={d.preview} alt="Your drawing" className="h-full w-full object-cover" />
                    : <Image src={r.url} alt="" fill sizes="45vw" className="object-cover" />}
                  <span className={`absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-xs ${d ? 'bg-cocoa text-ivory' : 'bg-white/90 text-cocoa'}`}>
                    {d ? 'Drawn ✓ · Edit' : 'Draw'}
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
            {multi && <p className="mb-2 text-stone">Closest option: {optionId ? `Option ${options.find(o => o.id === optionId)?.label}` : 'Not sure'}</p>}
            <ul className="space-y-1.5">
              {CHANGE_AREAS.filter(a => areas.includes(a.key)).map(a => (
                <li key={a.key}><span className="font-medium text-cocoa">{a.label}:</span> {notes[a.key]}</li>
              ))}
            </ul>
            {Object.keys(drawings).length > 0 && (
              <p className="mt-2 text-stone">{Object.keys(drawings).length} drawing{Object.keys(drawings).length > 1 ? 's' : ''} attached</p>
            )}
          </div>
          <label className="block">
            <span className="text-sm font-medium text-ink">Anything else? <span className="font-normal text-stone">(optional)</span></span>
            <textarea value={comments} onChange={e => setComments(e.target.value)} rows={3} maxLength={4000}
              className="mt-2 w-full rounded-xl border border-sand bg-white px-3 py-3 text-base focus:border-cocoa focus:outline-none" />
          </label>
        </div>
      )}
    </Sheet>
  )
}

function DrawEditor({ render, initial, onSave, onCancel }: {
  render: Render; initial?: Stroke[]; onSave(d: Drawing | null): void; onCancel(): void
}) {
  const ref = useRef<DrawingHandle>(null)
  const [colour, setColour] = useState(PEN_COLOURS[0].hex)
  const [size, setSize] = useState(PEN_SIZES[1].px)
  const [count, setCount] = useState(initial?.length ?? 0)
  const [saving, setSaving] = useState(false)

  async function save() {
    const h = ref.current
    if (!h) return
    if (h.strokes().length === 0) return onSave(null)
    setSaving(true)
    const jpeg = await h.exportJpeg()
    setSaving(false)
    if (!jpeg) return onSave(null)
    onSave({ strokes: h.strokes(), jpeg, preview: URL.createObjectURL(jpeg) })
  }

  return (
    <Sheet title="Draw on the design" onClose={onCancel}
      footer={<button className={primary} disabled={saving} onClick={save}>{saving && <Spinner />} {count ? 'Done' : 'Back without drawing'}</button>}>
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
