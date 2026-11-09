'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CLUSTER_STYLES, type ClusterStyle } from '@/lib/onboarding'
import { Spinner } from '@/components/brand'
import Lightbox, { type LightboxImage } from '@/components/Lightbox'
import LightboxThumbs from '@/components/LightboxThumbs'
import { AddPhotosButton, PhotoTray, usePhotoAttachments } from '@/components/PhotoAttach'
import { RingSizePicker } from '../client'
import { answerStaffQuestion, markSizeNotSure, saveClusterStyles, sendDesignerNotes, submitRingSize, uploadMessageImage } from '../actions'

const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-cocoa px-5 py-3.5 text-[15px] font-medium tracking-wide text-ivory transition-colors hover:bg-cocoa-dark disabled:opacity-50'
const secondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-cocoa/40 bg-white px-5 py-3.5 text-[15px] font-medium tracking-wide text-cocoa transition-colors hover:bg-linen disabled:opacity-50'
const field = 'w-full rounded-xl border border-sand bg-white px-4 py-3 text-base text-ink placeholder:text-stone/70 focus:border-cocoa focus:outline-none'

/** Runs a server action, shows its error, and refreshes the page (progress marker) on success. */
function useSubmit() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) => start(async () => {
    setError(null)
    try {
      const r = await fn()
      if (!r.ok) { setError(r.error); return }
      after?.()
      router.refresh()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'Something went wrong. Please try again.')
    }
  })
  return { pending, error, run }
}

function Tick({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4.5 10.5l3.5 3.5 7.5-8" />
    </svg>
  )
}

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
    </svg>
  )
}

// ── Ring size ─────────────────────────────────────────────────────────────────

export function RingSizeSection({ code, size, unconfirmed, notSure, messageLink }: {
  code: string; size: string | null; unconfirmed: boolean; notSure: boolean; messageLink: string
}) {
  const [value, setValue] = useState('')
  const { pending, error, run } = useSubmit()

  if (!unconfirmed) {
    return (
      <div className="mt-4 rounded-2xl border border-sand bg-white px-5 py-5">
        <p className="text-[15px] text-ink">Your ring size: <span className="font-serif text-2xl text-cocoa-dark">{size}</span></p>
        <Link href={messageLink} className="mt-1 inline-block text-sm text-stone underline underline-offset-4 hover:text-cocoa">Not right? Let us know</Link>
      </div>
    )
  }
  const hint = size?.replace(/\(?\s*tbc\s*\)?/i, '').trim()
  return (
    <div className="mt-4">
      <p className="text-[15.5px] leading-relaxed text-ink">
        If you know the ring size, add it here.{hint ? ` We’ve noted around ${hint} so far.` : ''}
      </p>
      {notSure && (
        <p className="mt-3 rounded-xl bg-linen px-4 py-3 text-[15px] text-ink">No problem, there’s no rush. You can add it here whenever you’re ready.</p>
      )}
      <div className="mt-4 rounded-2xl border border-sand bg-white p-4 sm:p-5">
        <label className="mb-2 block text-sm font-medium text-cocoa-dark">Ring size</label>
        <RingSizePicker value={value} onChange={setValue} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button type="button" className={primary} disabled={pending || !value.trim()}
            onClick={() => run(() => submitRingSize(code, value))}>
            {pending && <Spinner />} Save ring size
          </button>
          {!notSure && (
            <button type="button" className={secondary} disabled={pending} onClick={() => run(() => markSizeNotSure(code))}>
              Not sure yet
            </button>
          )}
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </div>

      <details className="group mt-4 rounded-2xl border border-sand bg-white/70">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[15px] font-medium text-cocoa-dark">
          How to find their ring size (without giving away the surprise)
          <span aria-hidden className="text-xl text-cocoa-light transition-transform group-open:rotate-45">+</span>
        </summary>
        <div className="space-y-3 border-t border-sand px-5 pb-5 pt-4 text-[15px] leading-relaxed text-ink">
          <p><span className="font-semibold text-cocoa-dark">Ask a friend or family member:</span> they may already know, or can find out discreetly. Just make sure they can keep a secret.</p>
          <p><span className="font-semibold text-cocoa-dark">Borrow one of their rings:</span> choose one they don’t wear often, and note which finger they wear it on, as sizes differ between fingers and hands. Bring it to us and we’ll measure it for you.</p>
          <p><span className="font-semibold text-cocoa-dark">The decoy:</span> wear a pinky ring yourself. At some point they’ll want to try it on. Note which finger they put it on and how well it fits, and we can use that as a reference.</p>
          <p className="rounded-xl bg-linen px-4 py-3">Don’t stress about perfection: most rings can be resized easily, and getting close is enough. We’ll also lean slightly larger, so the ring slips on for the proposal.</p>
        </div>
      </details>
    </div>
  )
}

// ── Irregular cluster ─────────────────────────────────────────────────────────

function ClusterPlaceholder({ k }: { k: ClusterStyle }) {
  return (
    <span className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-linen to-[#E9DFD2]">
      <span className="flex h-14 w-14 items-center justify-center rounded-full border border-cocoa/25 bg-ivory/70 font-serif text-2xl text-cocoa">{k}</span>
      <span className="text-[9px] uppercase tracking-[0.25em] text-stone">Image coming soon</span>
    </span>
  )
}

export function ClusterChooser({ code, initial, saved, locked, images }: {
  code: string; initial: string[]; saved: boolean; locked: boolean; images: Record<string, string | null>
}) {
  const [picked, setPicked] = useState<string[]>(initial)
  const [savedSet, setSavedSet] = useState<string[] | null>(saved ? initial : null)
  const [zoom, setZoom] = useState<number | null>(null)
  const { pending, error, run } = useSubmit()
  const dirty = savedSet === null || picked.join() !== savedSet.join()
  const photos = CLUSTER_STYLES.filter(s => images[s.key])
  const gallery: LightboxImage[] = photos.map(s => ({ url: images[s.key]!, alt: s.heading, caption: `${s.key}. ${s.heading} · ${s.line}` }))
  const toggle = (k: string) => !locked && setPicked(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])
  const ordered = CLUSTER_STYLES.map(s => s.key).filter(k => picked.includes(k))

  return (
    <div className="mt-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {CLUSTER_STYLES.map(s => {
          const on = picked.includes(s.key)
          const url = images[s.key]
          return (
            <div key={s.key} className={`flex flex-col overflow-hidden rounded-2xl border bg-white transition ${on ? 'border-cocoa ring-1 ring-cocoa' : 'border-sand'}`}>
              {url ? (
                <button type="button" onClick={() => setZoom(photos.findIndex(p => p.key === s.key))} aria-label={`Zoom in on ${s.heading}`}
                  className="group/img relative block aspect-square w-full cursor-zoom-in overflow-hidden bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cocoa">
                  <Image src={url} alt={s.heading} fill sizes="(min-width: 640px) 240px, 50vw"
                    className="object-contain transition-transform duration-500 ease-out [@media(hover:hover)]:group-hover/img:scale-[1.04]" />
                  <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-cocoa shadow-sm ring-1 ring-sand"><ZoomIcon /></span>
                </button>
              ) : (
                <span className="relative block aspect-square w-full overflow-hidden"><ClusterPlaceholder k={s.key} /></span>
              )}
              <div className="flex flex-1 flex-col p-3 sm:p-4">
                <h3 className="text-[13px] font-semibold uppercase leading-snug tracking-[0.12em] text-cocoa-dark">{s.key}. {s.heading}</h3>
                <p className="mt-1 text-[13.5px] leading-snug text-ink">{s.line}</p>
                <div className="mt-auto pt-3">
                  <button type="button" onClick={() => toggle(s.key)} disabled={locked} aria-pressed={on}
                    className={`flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors disabled:cursor-default
                      ${on ? 'bg-cocoa text-ivory' : 'border border-cocoa/40 text-cocoa hover:bg-linen'}`}>
                    {on ? <><Tick /> Selected</> : 'Select'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-sand bg-white/70 p-4 sm:p-5" role="status">
        {locked ? (
          <p className="text-[15px] text-ink">Your choice: {ordered.join(', ') || '—'}. Your design is underway with this.</p>
        ) : !dirty ? (
          <p className="flex items-center gap-2 text-[15px] text-ink"><Tick className="h-4 w-4 text-[#3F4A3A]" /> Thank you, we’ve noted {ordered.length > 1 ? 'these' : 'that'}. You can change your choice any time before your first designs.</p>
        ) : (
          <>
            <p className="text-[15px] text-stone">{ordered.length ? `Selected: ${ordered.join(', ')}` : 'Select one or more styles above.'}</p>
            <button type="button" className={`${primary} mt-3 w-full`} disabled={pending || !ordered.length}
              onClick={() => run(() => saveClusterStyles(code, ordered), () => setSavedSet(picked))}>
              {pending && <Spinner />} Save
            </button>
          </>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
      {zoom !== null && <Lightbox images={gallery} start={zoom} onClose={() => setZoom(null)} />}
    </div>
  )
}

// ── Questions from the team ───────────────────────────────────────────────────

function StaffQuestion({ code, q, locked }: { code: string; q: { id: string; question: string; answer: string | null }; locked: boolean }) {
  const [editing, setEditing] = useState(!q.answer)
  const [value, setValue] = useState(q.answer ?? '')
  const { pending, error, run } = useSubmit()
  return (
    <li className="rounded-2xl border border-sand bg-white p-4 sm:p-5">
      <p className="text-[15.5px] font-medium leading-relaxed text-cocoa-dark">{q.question}</p>
      {!editing && q.answer ? (
        <div className="mt-3 flex items-start gap-2.5">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#3F4A3A] text-ivory"><Tick className="h-3.5 w-3.5" /></span>
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink">{q.answer}</p>
            {!locked && (
              <button type="button" onClick={() => { setValue(q.answer ?? ''); setEditing(true) }}
                className="mt-1 text-sm text-stone underline underline-offset-4 hover:text-cocoa">Edit</button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <textarea value={value} onChange={e => setValue(e.target.value)} rows={3} maxLength={4000}
            placeholder="Your answer…" className={field} />
          <div className="mt-3 flex items-center gap-3">
            <button type="button" className={primary} disabled={pending || !value.trim()}
              onClick={() => run(() => answerStaffQuestion(code, q.id, value), () => setEditing(false))}>
              {pending && <Spinner />} Send
            </button>
            {q.answer && (
              <button type="button" onClick={() => setEditing(false)} className="text-sm text-stone underline underline-offset-4">Cancel</button>
            )}
          </div>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </li>
  )
}

export function StaffQuestions({ code, questions, locked }: {
  code: string; questions: { id: string; question: string; answer: string | null }[]; locked: boolean
}) {
  return (
    <ol className="mt-5 space-y-4">
      {questions.map(q => <StaffQuestion key={q.id} code={code} q={q} locked={locked} />)}
    </ol>
  )
}

// ── Anything else for our designers ───────────────────────────────────────────

export function DesignerNotes({ code, sent }: {
  code: string; sent: { id: string; body: string; photos: string[]; when: string }[]
}) {
  const [body, setBody] = useState('')
  const photos = usePhotoAttachments()
  const { pending, error, run } = useSubmit()
  const canSend = (body.trim() || photos.photos.length > 0) && !pending && photos.preparing === 0

  return (
    <div className="mt-4">
      {sent.length > 0 && (
        <ul className="mb-5 space-y-3">
          {sent.map(n => (
            <li key={n.id} className="rounded-2xl border border-sand bg-white p-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-cocoa-light">
                <Tick className="h-3.5 w-3.5 text-[#3F4A3A]" /> Sent to our designers · {n.when}
              </p>
              {n.body && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-ink">{n.body}</p>}
              {n.photos.length > 0 && (
                <LightboxThumbs className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5" sizes="20vw"
                  images={n.photos.map((u, i) => ({ url: u, alt: `Inspiration photo ${i + 1}` }))} />
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={`rounded-2xl border border-sand bg-white p-4 sm:p-5 ${photos.dragging ? 'outline-dashed outline-2 outline-offset-4 outline-cocoa' : ''}`} {...photos.dropProps}>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={8000}
          placeholder={sent.length ? 'Anything more to add?' : 'For example: a ring you love, a style you’d like to avoid…'} className={field} />
        <PhotoTray photos={photos.photos} preparing={photos.preparing} onRemove={photos.remove} />
        {photos.errors.map(e => <p key={e} role="alert" className="mt-2 text-sm text-red-700">{e}</p>)}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <AddPhotosButton onFiles={photos.add} disabled={photos.full || pending}
            className="inline-flex items-center gap-2 rounded-xl border border-sand bg-white px-4 py-3 text-[15px] text-cocoa hover:bg-linen disabled:opacity-50" />
          <span className="text-xs text-stone">Up to 5 inspiration photos</span>
        </div>
        <button type="button" className={`${primary} mt-4 w-full`} disabled={!canSend}
          onClick={() => run(async () => {
            const images = await photos.uploadAll(form => uploadMessageImage(code, form))
            return sendDesignerNotes(code, { body, images })
          }, () => { setBody(''); photos.clear() })}>
          {pending && <Spinner />} Send to our designers
        </button>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      </div>
    </div>
  )
}
