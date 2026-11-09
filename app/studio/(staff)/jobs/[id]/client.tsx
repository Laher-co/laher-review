'use client'

import Image from 'next/image'
import { useRef, useState, useTransition } from 'react'
import { upload } from '@vercel/blob/client'
import {
  addOption, addRender, confirmRingSize, createVersion, deleteDraftVersion, escalateJob, markHandledAction, moveRender,
  customerRepliedByEmail, logFollowupCall, setJobFlag, setStoneNotSecured, uploadStaffImage, markChangesRequested, publishVersion, setDoNotEmail, resolveEscalation, sendStaffReply,
  removeOption, removeRender, saveVersionNote, setSettingChoiceAction,
  addInternalNote, deleteInternalNote, editInternalNote,
  addOnboardingQuestion, postOnboardingLinkAction, removeOnboardingQuestion, sendOnboardingEmail, setIrregularClusterAction, setSettingQuestionAction,
} from '../../../actions'
import type { FullOption, FullVersion } from '@/lib/jobs'
import { Badge, Spinner } from '@/components/brand'
import Lightbox from '@/components/Lightbox'
import { AddPhotosButton, PhotoTray, usePhotoAttachments } from '@/components/PhotoAttach'
import { RING_SIZE_STATUS_LABEL } from '@/lib/feedback'
import { SETTING_CHOICES, SETTING_COPY, type SettingChoice } from '@/lib/setting'

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
  const [concept, setConcept] = useState<boolean | null>(null)
  const renderCount = version.options.reduce((n, o) => n + o.renders.length, 0)
  const ready = version.options.every(o => o.renders.length > 0)

  function publish() {
    if (concept === null) return
    const optionsText = version.options.length > 1 ? ` with ${version.options.length} options` : ''
    if (!confirm(`Publish ${title}${optionsText} as ${concept ? 'a CONCEPT render' : 'a full build'}? The customer will be emailed${doNotEmail ? ' (not this one: “Do not email”)' : ''} and can see it straight away, and the Trello card moves to Revision.`)) return
    run(async () => {
      if (note !== (version.designerNote ?? '')) await saveVersionNote(version.id, note)
      const res = await publishVersion(version.id, concept)
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
          <fieldset className="mb-3">
            <legend className="text-sm font-medium text-ink">Is this a concept render (not a full build)?</legend>
            <div className="mt-1.5 flex gap-2">
              {([true, false] as const).map(v => (
                <button key={String(v)} type="button" aria-pressed={concept === v} onClick={() => setConcept(v)}
                  className={`rounded-lg border px-4 py-2 text-sm ${concept === v ? 'border-cocoa bg-cocoa text-ivory' : 'border-sand bg-white text-cocoa'}`}>
                  {v ? 'Yes, concept' : 'No, full build'}
                </button>
              ))}
            </div>
          </fieldset>
          <button className={`${btnPrimary} px-6 py-3`} disabled={pending || !ready || concept === null} onClick={publish}>
            {pending && <Spinner />} Publish {title}
          </button>
          <span className="text-xs text-stone">
            {!ready ? 'Every option needs at least one render.' : concept === null ? 'Answer the concept question to publish.' : `${renderCount} render${renderCount === 1 ? '' : 's'} ready`}
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
        <strong className="text-lg text-ink">{size ? (status === 'unconfirmed' ? `around ${size.replace(/^(around|about)\s+/i, '')}` : size) : '—'}</strong>
        <Badge tone={tone}>{RING_SIZE_STATUS_LABEL[status]}</Badge>
        {status === 'unconfirmed' && size && <span className="text-xs text-stone">hint from the card (it says tbc)</span>}
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
  byEmail: boolean; attachments: { url: string; name: string; isImage: boolean }[]
}

export function StaffThread({ jobId, versionId, title, customerName, messages }: {
  jobId: string; versionId: string | null; title: string; customerName: string; messages: StaffThreadMessage[]
}) {
  const { pending, error, run } = useAction()
  const [body, setBody] = useState('')
  const [viewing, setViewing] = useState<{ urls: string[]; i: number; caption?: string } | null>(null)
  const photos = usePhotoAttachments()
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
                  {staffMsg ? m.staffName ?? 'Studio' : customerName} · {m.when}{m.byEmail && ' · by email'}
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
                {m.attachments.some(a => a.isImage) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.attachments.filter(a => a.isImage).map((a, i, imgs) => (
                      <button key={a.url} type="button" onClick={() => setViewing({ urls: imgs.map(x => x.url), i, caption: 'Photo' })}
                        className="relative h-16 w-16 overflow-hidden rounded-lg border border-sand bg-white">
                        <Image src={a.url} alt={a.name} fill sizes="64px" className="object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {m.attachments.some(a => !a.isImage) && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {m.attachments.filter(a => !a.isImage).map(a => (
                      <li key={a.url}><a href={a.url} target="_blank" rel="noreferrer" className="underline">📎 {a.name}</a></li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          )
        })}
      </ol>
      <div className={`mt-3 rounded-lg ${photos.dragging ? 'outline-dashed outline-2 outline-offset-4 outline-cocoa' : ''}`} {...photos.dropProps}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={2} maxLength={4000}
            placeholder={`Reply to ${customerName.split(' ')[0]}…`}
            className="flex-1 rounded-lg border border-sand bg-white px-3 py-2.5 text-base focus:border-cocoa focus:outline-none sm:text-sm" />
          <AddPhotosButton onFiles={photos.add} disabled={photos.full || pending} className={btnGhost} />
          <button className={btnPrimary} disabled={pending || photos.preparing > 0 || (!body.trim() && !photos.photos.length)}
            onClick={() => run(async () => {
              const images = await photos.uploadAll(form => uploadStaffImage(jobId, form))
              await sendStaffReply(jobId, versionId, body, images)
              setBody(''); photos.clear()
            })}>
            {pending && <Spinner />} Send reply
          </button>
        </div>
        <PhotoTray photos={photos.photos} preparing={photos.preparing} onRemove={photos.remove} />
        {photos.errors.map(e => <p key={e} role="alert" className="mt-2 text-sm text-red-700">{e}</p>)}
      </div>
      <p className="mt-1.5 text-xs text-stone">The customer sees your reply on their design page and gets an email (unless “Do not email” is on).</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {viewing && (
        <Lightbox start={viewing.i} onClose={() => setViewing(null)}
          images={viewing.urls.map((u, i) => ({ url: u, alt: `${viewing.caption ?? 'Drawing'} ${i + 1}`, caption: viewing.caption ?? 'Customer drawing' }))} />
      )}
    </div>
  )
}

// ── Queue and escalation ──────────────────────────────────────────────────────

export function QueuePanel({ jobId, waitingFor, waitedLabel, overdue, escalation }: {
  jobId: string
  waitingFor: string | null          // e.g. "a reply to a message"
  waitedLabel: string | null         // e.g. "2h 15m"
  overdue: boolean
  escalation: { id: string; note: string; by: string; when: string } | null
}) {
  const { pending, error, run } = useAction()
  const [escalating, setEscalating] = useState(false)
  const [note, setNote] = useState('')
  const [resolution, setResolution] = useState('')

  return (
    <div className="space-y-3">
      {waitingFor && (
        <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${overdue ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
          {overdue && <Badge tone="danger">Overdue</Badge>}
          <p className="text-sm text-ink">
            Customer waiting for {waitingFor} · <strong>{waitedLabel}</strong> <span className="text-stone">(working hours)</span>
          </p>
          <button className={`${btnGhost} ml-auto py-2`} disabled={pending} onClick={() => run(() => markHandledAction(jobId))}>
            Mark handled
          </button>
        </div>
      )}

      {escalation ? (
        <div className="rounded-xl border border-red-200 bg-white p-4">
          <p className="text-sm"><Badge tone="danger">Escalated to Rach</Badge> <span className="ml-2 text-stone">by {escalation.by}, {escalation.when}</span></p>
          <p className="mt-2 whitespace-pre-line text-sm text-ink">{escalation.note}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input value={resolution} onChange={e => setResolution(e.target.value)} placeholder="How it was resolved (optional)"
              className="flex-1 rounded-lg border border-sand bg-white px-3 py-2 text-base focus:border-cocoa focus:outline-none sm:text-sm" />
            <button className={btnPrimary} disabled={pending} onClick={() => run(() => resolveEscalation(escalation.id, resolution))}>
              {pending && <Spinner />} Mark resolved
            </button>
          </div>
        </div>
      ) : escalating ? (
        <div className="rounded-xl border border-sand bg-white p-4">
          <p className="text-sm font-medium text-ink">Escalate to Rach</p>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={2000}
            placeholder="What does Rach need to know or decide?"
            className="mt-2 w-full rounded-lg border border-sand bg-white px-3 py-2.5 text-base focus:border-cocoa focus:outline-none sm:text-sm" />
          <div className="mt-2 flex gap-2">
            <button className={btnPrimary} disabled={pending || !note.trim()}
              onClick={() => run(async () => { await escalateJob(jobId, note); setEscalating(false); setNote('') })}>
              {pending && <Spinner />} Escalate and email Rach
            </button>
            <button className="text-sm text-stone underline" onClick={() => setEscalating(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="text-sm text-cocoa underline underline-offset-4" onClick={() => setEscalating(true)}>Escalate to Rach…</button>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}

// ── Follow-ups ────────────────────────────────────────────────────────────────

export function FollowupPanel({ items }: { items: { id: string; label: string; flagged: boolean; detail: string }[] }) {
  const { pending, error, run } = useAction()
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [note, setNote] = useState('')
  return (
    <div className="space-y-2">
      {items.map(f => (
        <div key={f.id} className={`rounded-xl border px-4 py-3 ${f.flagged ? 'border-red-300 bg-red-50' : 'border-sand bg-white/60'}`}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={f.flagged ? 'danger' : 'neutral'}>{f.label}</Badge>
            <span className="text-sm text-stone">{f.detail}</span>
            {noteFor !== f.id && (
              <button className="ml-auto text-sm text-cocoa underline" onClick={() => setNoteFor(f.id)}>
                {f.flagged ? 'Log call' : 'Followed up by phone'}
              </button>
            )}
          </div>
          {noteFor === f.id && (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="What happened? (optional)"
                className="flex-1 rounded-lg border border-sand bg-white px-3 py-2 text-base focus:border-cocoa focus:outline-none sm:text-sm" />
              <button className={btnPrimary} disabled={pending}
                onClick={() => run(async () => { await logFollowupCall(f.id, note); setNoteFor(null); setNote('') })}>
                {pending && <Spinner />} Save and clear
              </button>
            </div>
          )}
        </div>
      ))}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  )
}

// ── Customer emails ───────────────────────────────────────────────────────────

/** On/off switch that also adds or removes the "Do not email" label in Trello. */
export function DoNotEmailSwitch({ jobId, on }: { jobId: string; on: boolean }) {
  const { pending, error, run } = useAction()
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" role="switch" aria-checked={on} disabled={pending}
        onClick={() => run(() => setDoNotEmail(jobId, !on))}
        className={`inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${on ? 'border-red-200 bg-red-50 text-red-700' : 'border-sand bg-white text-cocoa'}`}>
        <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-red-600' : 'bg-sand'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
        {pending ? <Spinner /> : null}
        Do not email
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** The customer answered by email outside the app: stop reminders and log a note. */
export function RepliedByEmailButton({ jobId, notes }: { jobId: string; notes: { by: string; when: string; note: string | null }[] }) {
  const { pending, error, run } = useAction()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  return (
    <div className="rounded-xl border border-sand bg-white/60 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-stone">Customer emailed the studio directly?</span>
        {!open && (
          <button className="ml-auto text-sm text-cocoa underline" onClick={() => setOpen(true)}>Customer replied by email</button>
        )}
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="What did they say? (optional)" maxLength={2000}
            className="flex-1 rounded-lg border border-sand bg-white px-3 py-2 text-base focus:border-cocoa focus:outline-none sm:text-sm" />
          <button className={btnPrimary} disabled={pending}
            onClick={() => run(async () => { await customerRepliedByEmail(jobId, note); setOpen(false); setNote('') })}>
            {pending && <Spinner />} Save and stop reminders
          </button>
        </div>
      )}
      {notes.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-ink">
          {notes.map((n, i) => (
            <li key={i}><span className="text-stone">{n.when} · {n.by}:</span> Customer replied by email{n.note ? `: “${n.note}”` : '.'}</li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  )
}

/** Internal only: the customer asked for changes outside the portal (call, email, in person). */
export function ChangesRequestedButton({ jobId }: { jobId: string }) {
  const { pending, error, run } = useAction()
  const [result, setResult] = useState<string | null>(null)
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" className={btnGhost} disabled={pending}
        onClick={() => run(async () => setResult(await markChangesRequested(jobId)))}>
        {pending && <Spinner />} Changes requested
      </button>
      {result && <p className="text-xs text-stone">{result}</p>}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** Internal only: centre stone still to be sourced. Mirrors the STONE NEEDS SOURCING label. */
export function StoneSwitch({ jobId, on }: { jobId: string; on: boolean }) {
  const { pending, error, run } = useAction()
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" role="switch" aria-checked={on} disabled={pending}
        onClick={() => run(() => setStoneNotSecured(jobId, !on))}
        className={`inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${on ? 'border-red-300 bg-red-50 text-red-800' : 'border-sand bg-white text-cocoa'}`}>
        <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-red-700' : 'bg-sand'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
        {pending ? <Spinner /> : null}
        Centre stone not secured
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

/** "Side stones not confirmed" (internal) and "Concept render" switches; the Trello label follows. */
export function FlagSwitch({ jobId, flag, on, label }: { jobId: string; flag: 'side_stones' | 'concept'; on: boolean; label: string }) {
  const { pending, error, run } = useAction()
  const tone = flag === 'side_stones' ? ['border-amber-300 bg-amber-50 text-amber-900', 'bg-amber-600'] : ['border-violet-300 bg-violet-50 text-violet-900', 'bg-violet-600']
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" role="switch" aria-checked={on} disabled={pending}
        onClick={() => run(() => setJobFlag(jobId, flag, !on))}
        className={`inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${on ? tone[0] : 'border-sand bg-white text-cocoa'}`}>
        <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? tone[1] : 'bg-sand'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
        {pending ? <Spinner /> : null}
        {label}
      </button>
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  )
}

// ── Onboarding page ───────────────────────────────────────────────────────────

function MiniSwitch({ on, disabled, onClick, label }: { on: boolean; disabled?: boolean; onClick(): void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={onClick}
      className={`inline-flex items-center gap-2.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${on ? 'border-cocoa/40 bg-linen text-cocoa-dark' : 'border-sand bg-white text-cocoa'}`}>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-cocoa' : 'bg-sand'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
      {label}
    </button>
  )
}

export type OnboardingPanelProps = {
  jobId: string; url: string; linkPostedAt: string | null
  progress: { done: number; total: number; sections: { label: string; done: boolean }[] }
  setting: { on: boolean; choice: SettingChoice | null; answeredBy: string | null; answeredAt: string | null; locked: boolean }
  cluster: { on: boolean; auto: boolean; override: boolean | null; styles: string[]; savedAt: string | null }
  questions: { id: string; question: string; answer: string | null; answeredAt: string | null; askedBy: string }[]
  notes: { id: string; body: string; photos: string[]; when: string }[]
  email: { doNotEmail: boolean; welcomeSent: string | null; welcomeBy: string | null; needsNudge: boolean; nudgeSent: string | null; nudgeBy: string | null }
}

/** The customer's onboarding page: link, which questions are on, and everything they've answered. */
export function OnboardingPanel(p: OnboardingPanelProps) {
  const { pending, error, run } = useAction()
  const [newQ, setNewQ] = useState('')
  const sub = 'text-xs uppercase tracking-widest text-cocoa-light'
  return (
    <section className="rounded-2xl border border-sand bg-white/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-xl text-cocoa-dark">Onboarding page</h2>
          <p className="mt-1 text-sm text-stone">
            {p.progress.total ? `${p.progress.done} of ${p.progress.total} done` : 'Nothing for the customer to answer yet'}
            {p.progress.sections.length > 0 && ` · ${p.progress.sections.map(s => `${s.label}${s.done ? ' ✓' : ''}`).join(' · ')}`}
          </p>
        </div>
        {pending && <Spinner />}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="flex items-center gap-2"><span className="text-cocoa-light">Customer link:</span> <CopyLink url={p.url} /></span>
        {p.linkPostedAt
          ? <span className="text-xs text-stone">Posted on the Trello card {p.linkPostedAt}</span>
          : <button type="button" disabled={pending} onClick={() => run(() => postOnboardingLinkAction(p.jobId))}
              className={`${btnGhost} px-3 py-1.5 text-xs`}>Post link on the Trello card</button>}
      </div>

      {/* Welcome email: only ever sent by a person */}
      <div className="mt-4 rounded-xl border border-sand bg-white px-4 py-3 text-sm">
        {p.email.doNotEmail ? (
          <p className="text-amber-900">Do not email is on, contact the customer directly.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={pending} className={p.email.welcomeSent ? `${btnGhost} px-3 py-1.5 text-xs` : `${btnPrimary} px-3 py-2 text-xs`}
                onClick={() => (!p.email.welcomeSent || confirm('Send the welcome email again?')) && run(() => sendOnboardingEmail(p.jobId, 'welcome'))}>
                {p.email.welcomeSent ? 'Resend' : 'Send welcome email'}
              </button>
              <span className="text-xs text-stone">
                {p.email.welcomeSent ? `Sent ${p.email.welcomeSent} by ${p.email.welcomeBy}` : 'Not sent yet. Thanks them and links to their welcome page.'}
              </span>
            </div>
            {p.email.needsNudge && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-amber-50 px-3 py-2">
                <button type="button" disabled={pending} className={`${btnPrimary} px-3 py-2 text-xs`}
                  onClick={() => run(() => sendOnboardingEmail(p.jobId, 'question'))}>Let the customer know</button>
                <span className="text-xs text-amber-900">A question was added after the welcome email. Sends “We have one more quick question about your design”.</span>
              </div>
            )}
            {!p.email.needsNudge && p.email.nudgeSent && (
              <p className="mt-2 text-xs text-stone">Customer told about a new question {p.email.nudgeSent} by {p.email.nudgeBy}</p>
            )}
          </>
        )}
      </div>

      {/* Setting question */}
      <div className="mt-5 border-t border-sand pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={sub}>Setting and wedding band</p>
          <MiniSwitch on={p.setting.on} disabled={pending} label="Setting question"
            onClick={() => run(() => setSettingQuestionAction(p.jobId, !p.setting.on))} />
        </div>
        {p.setting.on && (
          <div className="mt-3 rounded-xl border border-sand bg-white px-4 py-3">
            {p.setting.choice ? (
              <>
                <p className="font-semibold tracking-wide text-cocoa-dark">{SETTING_COPY[p.setting.choice].label}</p>
                <p className="mt-0.5 text-xs text-stone">
                  {p.setting.answeredBy ? `Set by ${p.setting.answeredBy}` : 'Chosen by the customer'}{p.setting.answeredAt ? ` · ${p.setting.answeredAt}` : ''}
                  {p.setting.locked ? ' · Version One is published, so the customer can no longer change it' : ''}
                </p>
              </>
            ) : <p className="text-sm text-stone">Not answered yet.</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-cocoa-light">Set the answer:</span>
              {SETTING_CHOICES.map(c => (
                <button key={c} type="button" disabled={pending || p.setting.choice === c}
                  onClick={() => run(() => setSettingChoiceAction(p.jobId, c))}
                  className={`${btnGhost} px-3 py-1.5 text-xs ${p.setting.choice === c ? 'border-cocoa bg-linen' : ''}`}>
                  {c === 'high_set' ? 'High set' : 'Low set'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Irregular cluster */}
      <div className="mt-5 border-t border-sand pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={sub}>Irregular cluster</p>
            <p className="mt-0.5 text-xs text-stone">
              {p.cluster.override === null
                ? `Following the card description (${p.cluster.auto ? 'mentions' : 'doesn’t mention'} “irregular cluster”)`
                : <>Set by staff · <button type="button" className="underline" disabled={pending} onClick={() => run(() => setIrregularClusterAction(p.jobId, null))}>follow the description again</button></>}
            </p>
          </div>
          <MiniSwitch on={p.cluster.on} disabled={pending} label="Irregular cluster question"
            onClick={() => run(() => setIrregularClusterAction(p.jobId, !p.cluster.on))} />
        </div>
        {p.cluster.on && (
          <p className="mt-3 rounded-xl border border-sand bg-white px-4 py-3 text-sm">
            {p.cluster.savedAt
              ? <><span className="font-semibold text-cocoa-dark">{p.cluster.styles.join(' · ')}</span> <span className="text-xs text-stone">· {p.cluster.savedAt}</span></>
              : <span className="text-stone">Not answered yet.</span>}
          </p>
        )}
      </div>

      {/* Questions from the team */}
      <div className="mt-5 border-t border-sand pt-4">
        <p className={sub}>Questions from the team</p>
        {p.questions.length > 0 && (
          <ul className="mt-3 space-y-2">
            {p.questions.map(q => (
              <li key={q.id} className="rounded-xl border border-sand bg-white px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-cocoa-dark">{q.question}</p>
                  <button type="button" disabled={pending} className="shrink-0 text-xs text-stone underline hover:text-red-700"
                    onClick={() => { if (confirm(q.answer ? 'Remove this question and the customer’s answer?' : 'Remove this question?')) run(() => removeOnboardingQuestion(q.id)) }}>
                    Remove
                  </button>
                </div>
                {q.answer
                  ? <p className="mt-1 whitespace-pre-line text-ink">✓ {q.answer} <span className="text-xs text-stone">· {q.answeredAt}</span></p>
                  : <p className="mt-1 text-stone">Not answered yet</p>}
                <p className="mt-1 text-[11px] text-stone">Asked by {q.askedBy}</p>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-2">
          <input value={newQ} onChange={e => setNewQ(e.target.value)} maxLength={1000} placeholder="Add a question for the customer…"
            className="min-w-0 flex-1 rounded-lg border border-sand bg-white px-3 py-2 text-sm focus:border-cocoa focus:outline-none" />
          <button type="button" className={btnPrimary} disabled={pending || !newQ.trim()}
            onClick={() => run(async () => { await addOnboardingQuestion(p.jobId, newQ); setNewQ('') })}>Add</button>
        </div>
        {p.linkPostedAt && <p className="mt-1 text-xs text-stone">Adding a question posts “New question added” on the card, so the team can let the customer know.</p>}
      </div>

      {/* Notes for the designers */}
      {p.notes.length > 0 && (
        <div className="mt-5 border-t border-sand pt-4">
          <p className={sub}>Notes for the designers</p>
          <ul className="mt-3 space-y-2">
            {p.notes.map(n => (
              <li key={n.id} className="rounded-xl border border-sand bg-white px-4 py-3 text-sm">
                <p className="text-xs text-stone">{n.when}</p>
                {n.body && <p className="mt-1 whitespace-pre-line text-ink">{n.body}</p>}
                {n.photos.length > 0 && (
                  <div className="mt-2 grid grid-cols-5 gap-1.5">
                    {n.photos.map((u, i) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className="relative block aspect-square overflow-hidden rounded-md border border-sand">
                        <Image src={u} alt={`Inspiration photo ${i + 1}`} fill sizes="120px" className="object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </section>
  )
}

// ── Internal notes ────────────────────────────────────────────────────────────

type InternalNote = { id: string; body: string; author: string; when: string; edited: string | null; mine: boolean }

function InternalNoteItem({ n }: { n: InternalNote }) {
  const { pending, error, run } = useAction()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(n.body)
  return (
    <li className="rounded-xl border border-sand bg-white px-4 py-3 text-sm">
      <p className="text-xs text-stone">{n.author} · {n.when}{n.edited ? ` · edited ${n.edited}` : ''}</p>
      {editing ? (
        <div className="mt-2">
          <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={8000}
            className="w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm focus:border-cocoa focus:outline-none" />
          <div className="mt-2 flex gap-2">
            <button type="button" className={`${btnPrimary} px-3 py-1.5 text-xs`} disabled={pending || !text.trim()}
              onClick={() => run(async () => { await editInternalNote(n.id, text); setEditing(false) })}>Save</button>
            <button type="button" className={`${btnGhost} px-3 py-1.5 text-xs`} onClick={() => { setText(n.body); setEditing(false) }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="mt-1 whitespace-pre-line text-ink">{n.body}</p>
      )}
      {n.mine && !editing && (
        <div className="mt-1.5 flex gap-3 text-xs">
          <button type="button" className="text-stone underline hover:text-cocoa" onClick={() => setEditing(true)}>Edit</button>
          <button type="button" className="text-stone underline hover:text-red-700" disabled={pending}
            onClick={() => confirm('Delete this note?') && run(() => deleteInternalNote(n.id))}>Delete</button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </li>
  )
}

/** Staff-only notes (e.g. changes the customer emailed or phoned about). Never shown to the customer or posted to Trello. */
export function InternalNotes({ jobId, notes }: { jobId: string; notes: InternalNote[] }) {
  const { pending, error, run } = useAction()
  const [text, setText] = useState('')
  return (
    <section className="rounded-2xl border border-sand bg-white/70 p-5 sm:p-6">
      <h2 className="font-serif text-xl text-cocoa-dark">Internal notes</h2>
      <p className="mt-1 text-sm text-stone">Staff only: never shown to the customer, emailed or posted to Trello.</p>
      <textarea value={text} onChange={e => setText(e.target.value)} rows={3} maxLength={8000}
        placeholder="e.g. Customer phoned: would like the band 1.8mm instead of 2mm"
        className="mt-4 w-full rounded-lg border border-sand bg-white px-3 py-2 text-sm focus:border-cocoa focus:outline-none" />
      <button type="button" className={`${btnPrimary} mt-2`} disabled={pending || !text.trim()}
        onClick={() => run(async () => { await addInternalNote(jobId, text); setText('') })}>
        {pending && <Spinner />} Add note
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {notes.length > 0 && <ul className="mt-4 space-y-2">{notes.map(n => <InternalNoteItem key={n.id} n={n} />)}</ul>}
    </section>
  )
}
