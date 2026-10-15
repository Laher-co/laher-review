'use client'

import Image from 'next/image'
import { useRef, useState, useTransition } from 'react'
import { upload } from '@vercel/blob/client'
import {
  addOption, addRender, confirmRingSize, createVersion, deleteDraftVersion, moveRender, publishVersion, sendStaffReply,
  removeOption, removeRender, saveVersionNote,
} from '../../../actions'
import type { FullOption, FullVersion } from '@/lib/jobs'
import { Badge, Spinner } from '@/components/brand'
import Lightbox from '@/components/Lightbox'
import { RING_SIZE_STATUS_LABEL } from '@/lib/feedback'

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm transition-colors disabled:opacity-50'
const btnPrimary = `${btn} bg-cocoa text-ivory hover:bg-cocoa-dark`
const btnGhost = `${btn} border border-sand bg-white text-cocoa hover:bg-linen`

// Server actions throw plain errors; show their message
function useAction() {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.') }
  })
  return { pending, error, run }
}

// ── Small pieces ──────────────────────────────────────────────────────────────

export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <span className="flex items-center gap-2">
      <a href={url} target="_blank" rel="noreferrer" className="truncate text-cocoa underline">Open</a>
      <button type="button" className="text-xs text-stone underline hover:text-cocoa"
        onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </span>
  )
}

export function NewVersionButton({ jobId, label }: { jobId: string; label: string }) {
  const { pending, error, run } = useAction()
  return (
    <div className="rounded-2xl border border-dashed border-sand bg-white/40 p-6 text-center">
      <button className={btnPrimary} disabled={pending} onClick={() => run(() => createVersion(jobId))}>
        {pending && <Spinner />} {label}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

// ── Upload ────────────────────────────────────────────────────────────────────

type Pending = { key: string; name: string; pct: number; error?: string }

async function imageSize(file: File): Promise<{ width?: number; height?: number }> {
  try {
    const bmp = await createImageBitmap(file)
    const size = { width: bmp.width, height: bmp.height }
    bmp.close()
    return size
  } catch {
    return {}
  }
}

function UploadZone({ jobId, versionNumber, option }: { jobId: string; versionNumber: number; option: FullOption }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [pending, setPending] = useState<Pending[]>([])

  async function uploadFiles(files: File[]) {
    const images = files.filter(f => f.type.startsWith('image/'))
    const entries = images.map((f, i) => ({ key: `${Date.now()}-${i}`, name: f.name, pct: 0 }))
    setPending(p => [...p, ...entries])
    const update = (key: string, patch: Partial<Pending>) =>
      setPending(p => p.map(x => x.key === key ? { ...x, ...patch } : x))

    // Two at a time keeps phones on mobile data responsive
    const queue = images.map((file, i) => ({ file, key: entries[i].key }))
    async function worker() {
      for (let job = queue.shift(); job; job = queue.shift()) {
        const { file, key } = job
        try {
          const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')
          const blob = await upload(`renders/${jobId}/v${versionNumber}/${safe}`, file, {
            access: 'public',
            handleUploadUrl: '/api/staff/upload',
            clientPayload: JSON.stringify({ optionId: option.id }),
            multipart: file.size > 8 * 1024 * 1024,
            onUploadProgress: ({ percentage }) => update(key, { pct: Math.round(percentage) }),
          })
          const { width, height } = await imageSize(file)
          await addRender(option.id, { url: blob.url, pathname: blob.pathname }, width, height)
          setPending(p => p.filter(x => x.key !== key))
        } catch (e) {
          update(key, { error: e instanceof Error ? e.message : 'Upload failed' })
        }
      }
    }
    await Promise.all([worker(), worker()])
  }

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); uploadFiles(Array.from(e.dataTransfer.files)) }}
        onClick={() => inputRef.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          dragging ? 'border-cocoa bg-linen' : 'border-sand bg-ivory hover:border-cocoa-light'}`}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-cocoa-light" aria-hidden>
          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="mt-2 text-sm text-ink"><span className="hidden sm:inline">Drop renders here or </span>tap to choose files</p>
        <p className="mt-0.5 text-xs text-stone">JPG, PNG or WebP · up to 50 MB each</p>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = '' }} />
      </div>

      {pending.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {pending.map(p => (
            <li key={p.key} className="flex items-center gap-3 text-xs">
              <span className="w-40 truncate text-stone">{p.name}</span>
              {p.error
                ? <span className="text-red-700">{p.error}
                    <button className="ml-2 underline" onClick={() => setPending(x => x.filter(y => y.key !== p.key))}>Dismiss</button>
                  </span>
                : <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sand">
                    <span className="block h-full bg-cocoa transition-all" style={{ width: `${p.pct}%` }} />
                  </span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Option card ───────────────────────────────────────────────────────────────

function OptionCard({ jobId, versionNumber, option, canRemove, showLabel }: {
  jobId: string; versionNumber: number; option: FullOption; canRemove: boolean; showLabel: boolean
}) {
  const { pending, error, run } = useAction()
  const [viewing, setViewing] = useState<number | null>(null)
  return (
    <div className="rounded-xl border border-sand bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-serif text-lg text-cocoa-dark">{showLabel ? `Option ${option.label}` : 'Renders'}</h3>
        {canRemove && (
          <button className="text-xs text-stone underline hover:text-red-700" disabled={pending}
            onClick={() => { if (confirm(`Remove Option ${option.label} and its renders?`)) run(() => removeOption(option.id)) }}>
            Remove option
          </button>
        )}
      </div>

      {option.renders.length > 0 && (
        <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {option.renders.map((r, i) => (
            <li key={r.id} className="group relative aspect-square overflow-hidden rounded-lg border border-sand bg-linen">
              <button type="button" onClick={() => setViewing(i)} aria-label="View full screen" className="absolute inset-0 cursor-zoom-in">
                <Image src={r.blobUrl} alt="" fill sizes="(min-width: 640px) 220px, 45vw" className="object-cover" />
              </button>
              {i === 0 && <span className="pointer-events-none absolute left-1.5 top-1.5 z-10 rounded bg-cocoa/85 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-ivory">Cover</span>}
              <div className="absolute inset-x-0 bottom-0 z-10 flex justify-between bg-gradient-to-t from-black/60 to-transparent p-1.5">
                <span className="flex gap-1">
                  <IconButton label="Move earlier" disabled={i === 0 || pending} onClick={() => run(() => moveRender(r.id, -1))}>‹</IconButton>
                  <IconButton label="Move later" disabled={i === option.renders.length - 1 || pending} onClick={() => run(() => moveRender(r.id, 1))}>›</IconButton>
                </span>
                <IconButton label="Delete render" disabled={pending}
                  onClick={() => { if (confirm('Delete this render?')) run(() => removeRender(r.id)) }}>✕</IconButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      {viewing !== null && (
        <Lightbox start={viewing} onClose={() => setViewing(null)}
          images={option.renders.map((r, i) => ({ url: r.blobUrl, alt: `Render ${i + 1}`, caption: showLabel ? `Option ${option.label}` : undefined }))} />
      )}
      <UploadZone jobId={jobId} versionNumber={versionNumber} option={option} />
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

function IconButton({ label, onClick, disabled, children }: {
  label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-md bg-white/90 text-sm text-ink shadow-sm hover:bg-white disabled:opacity-30">
      {children}
    </button>
  )
}

// ── Draft version ─────────────────────────────────────────────────────────────

export function DraftVersion({ jobId, version, title, doNotEmail }: {
  jobId: string; version: FullVersion; title: string; doNotEmail: boolean
}) {
  const { pending, error, run } = useAction()
  const [note, setNote] = useState(version.designerNote ?? '')
  const renderCount = version.options.reduce((n, o) => n + o.renders.length, 0)
  const ready = version.options.every(o => o.renders.length > 0)

  function publish() {
    const optionsText = version.options.length > 1 ? ` with ${version.options.length} options` : ''
    if (!confirm(`Publish ${title}${optionsText}? The customer will be able to see it straight away, and the Trello card moves to Revision.`)) return
    run(async () => {
      if (note !== (version.designerNote ?? '')) await saveVersionNote(version.id, note)
      const res = await publishVersion(version.id)
      if (!res.ok) throw new Error(res.error)
    })
  }

  return (
    <section className="rounded-2xl border-2 border-cocoa/30 bg-white/80 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl text-cocoa-dark">{title}</h2>
        <span className="text-xs uppercase tracking-widest text-cocoa-light">Draft · not visible to customer</span>
      </div>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-cocoa-light">
          Note for the customer <span className="font-normal normal-case tracking-normal text-stone">(optional)</span>
        </span>
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
          onBlur={() => { if (note !== (version.designerNote ?? '')) run(() => saveVersionNote(version.id, note)) }}
          placeholder="e.g. We’ve slimmed the band to 1.8mm and lowered the setting as discussed."
          className="w-full rounded-lg border border-sand bg-white px-3 py-2.5 text-base text-ink focus:border-cocoa focus:outline-none sm:text-sm" />
      </label>

      <div className={`mt-5 grid gap-4 ${version.options.length > 1 ? 'lg:grid-cols-2' : ''}`}>
        {version.options.map(o => (
          <OptionCard key={o.id} jobId={jobId} versionNumber={version.number} option={o}
            canRemove={version.options.length > 1} showLabel={version.options.length > 1} />
        ))}
      </div>

      <div className="mt-4">
        <button className={btnGhost} disabled={pending || version.options.length >= 6} onClick={() => run(() => addOption(version.id))}>
          + Add another option
        </button>
        <p className="mt-1.5 text-xs text-stone">Use options when the customer should choose between designs (Option A, Option B).</p>
      </div>

      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-sand pt-5 sm:flex-row sm:items-center sm:justify-between">
        <button className="text-sm text-stone underline hover:text-red-700" disabled={pending}
          onClick={() => { if (confirm(`Delete this draft of ${title} and its uploads?`)) run(() => deleteDraftVersion(version.id)) }}>
          Delete draft
        </button>
        <div className="flex flex-col items-stretch gap-1 sm:items-end">
          <button className={`${btnPrimary} px-6 py-3`} disabled={pending || !ready} onClick={publish}>
            {pending && <Spinner />} Publish {title}
          </button>
          <span className="text-xs text-stone">
            {!ready ? 'Every option needs at least one render.' : `${renderCount} render${renderCount === 1 ? '' : 's'} ready`}
            {doNotEmail && ' · Do not email: customer won’t be emailed'}
          </span>
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </section>
  )
}

// ── Ring size ─────────────────────────────────────────────────────────────────

export function RingSizeControl({ jobId, size, status, confirmedBy, confirmedAt }: {
  jobId: string; size: string | null; status: 'unconfirmed' | 'submitted' | 'confirmed'
  confirmedBy: string | null; confirmedAt: string | null
}) {
  const { pending, error, run } = useAction()
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(size ?? '')
  const tone = status === 'confirmed' ? 'ok' : status === 'submitted' ? 'cocoa' : 'warn'

  return (
    <div className={`mt-4 rounded-xl border p-4 ${status === 'submitted' ? 'border-cocoa/40 bg-linen' : 'border-sand bg-ivory'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-widest text-cocoa-light">Ring size</span>
        <strong className="text-lg text-ink">{size ?? '—'}</strong>
        <Badge tone={tone}>{RING_SIZE_STATUS_LABEL[status]}</Badge>
        {status === 'confirmed' && confirmedBy && <span className="text-xs text-stone">by {confirmedBy}, {confirmedAt}</span>}
        {!editing && (
          <button className="ml-auto text-sm text-cocoa underline" onClick={() => setEditing(true)}>
            {status === 'confirmed' ? 'Change' : status === 'submitted' ? 'Check & confirm' : 'Confirm a size'}
          </button>
        )}
      </div>
      {status === 'submitted' && !editing && (
        <p className="mt-1 text-sm text-cocoa-dark">The customer submitted this size. Check it, then confirm.</p>
      )}
      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. M ½" maxLength={40}
            className="w-40 rounded-lg border border-sand bg-white px-3 py-2 text-base focus:border-cocoa focus:outline-none" />
          <button className={btnPrimary} disabled={pending || !value.trim()}
            onClick={() => run(async () => { await confirmRingSize(jobId, value); setEditing(false) })}>
            {pending && <Spinner />} Mark confirmed
          </button>
          <button className="text-sm text-stone underline" onClick={() => { setEditing(false); setValue(size ?? '') }}>Cancel</button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

// ── Messages ──────────────────────────────────────────────────────────────────

export type StaffThreadMessage = {
  id: string; author: 'customer' | 'staff'; staffName: string | null; body: string; drawings: string[]; when: string
}

export function StaffThread({ jobId, versionId, title, customerName, messages }: {
  jobId: string; versionId: string | null; title: string; customerName: string; messages: StaffThreadMessage[]
}) {
  const { pending, error, run } = useAction()
  const [body, setBody] = useState('')
  const [viewing, setViewing] = useState<{ urls: string[]; i: number } | null>(null)
  const last = messages[messages.length - 1]
  const awaitingReply = last?.author === 'customer'

  return (
    <div className={`rounded-xl border p-4 ${awaitingReply ? 'border-amber-300 bg-amber-50/50' : 'border-sand bg-white/60'}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-cocoa-light">{title}</h3>
        {awaitingReply && <Badge tone="warn">Awaiting reply</Badge>}
      </div>
      {messages.length === 0 && <p className="mt-2 text-sm text-stone">No messages yet.</p>}
      <ol className="mt-3 space-y-2.5">
        {messages.map(m => {
          const staffMsg = m.author === 'staff'
          return (
            <li key={m.id} className={`flex ${staffMsg ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${staffMsg ? 'rounded-br-md bg-cocoa text-ivory' : 'rounded-bl-md border border-sand bg-white text-ink'}`}>
                <p className={`mb-0.5 text-[11px] uppercase tracking-wider ${staffMsg ? 'text-ivory/70' : 'text-cocoa-light'}`}>
                  {staffMsg ? m.staffName ?? 'Studio' : customerName} · {m.when}
                </p>
                {m.body && <p className="whitespace-pre-line text-sm leading-relaxed">{m.body}</p>}
                {m.drawings.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.drawings.map((u, i) => (
                      <button key={u} type="button" onClick={() => setViewing({ urls: m.drawings, i })}
                        className="relative h-16 w-16 overflow-hidden rounded-lg border border-sand bg-white">
                        <Image src={u} alt="Customer drawing" fill sizes="64px" className="object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} maxLength={4000}
          placeholder={`Reply to ${customerName.split(' ')[0]}…`}
          className="flex-1 rounded-lg border border-sand bg-white px-3 py-2.5 text-base focus:border-cocoa focus:outline-none sm:text-sm" />
        <button className={btnPrimary} disabled={pending || !body.trim()}
          onClick={() => run(async () => { await sendStaffReply(jobId, versionId, body); setBody('') })}>
          {pending && <Spinner />} Send reply
        </button>
      </div>
      <p className="mt-1.5 text-xs text-stone">The customer sees replies on their review page. Reply emails start in Phase 4.</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {viewing && (
        <Lightbox start={viewing.i} onClose={() => setViewing(null)}
          images={viewing.urls.map((u, i) => ({ url: u, alt: `Drawing ${i + 1}`, caption: 'Customer drawing' }))} />
      )}
    </div>
  )
}
