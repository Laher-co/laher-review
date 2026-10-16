'use client'

import { useEffect, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import Link from 'next/link'
import { createJob, previewCard, type CardPreview } from '../../actions'
import { Badge, Spinner } from '@/components/brand'

const input = 'w-full rounded-lg border border-sand bg-white px-3 py-3 text-base text-ink focus:border-cocoa focus:outline-none'
const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-widest text-cocoa-light'

function CreateButton() {
  const { pending } = useFormStatus()
  return (
    <button disabled={pending}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-cocoa py-3.5 text-sm font-medium text-ivory hover:bg-cocoa-dark disabled:opacity-60">
      {pending && <Spinner />} Create job
    </button>
  )
}

export default function NewJobForm({ designers, initialCard = '' }: { designers: { id: string; name: string }[]; initialCard?: string }) {
  const [cardRef, setCardRef] = useState(initialCard)
  const [preview, setPreview] = useState<CardPreview | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [looking, startLookup] = useTransition()
  const [state, action] = useFormState(createJob, {})

  function lookup() {
    setLookupError(null)
    setPreview(null)
    startLookup(async () => {
      const res = await previewCard(cardRef)
      if (res.error) setLookupError(res.error)
      else setPreview(res.preview ?? null)
    })
  }

  // Arrived from a card's Studio link that needed checking: look it up straight away
  useEffect(() => { if (initialCard) lookup() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-8 space-y-6">
      <div>
        <label className={label} htmlFor="cardRef">Trello card link</label>
        <div className="flex gap-2">
          <input id="cardRef" value={cardRef} onChange={e => setCardRef(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); lookup() } }}
            placeholder="https://trello.com/c/…" className={input} />
          <button type="button" onClick={lookup} disabled={!cardRef.trim() || looking}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-cocoa px-4 text-sm text-cocoa hover:bg-linen disabled:opacity-50">
            {looking && <Spinner />} Look up
          </button>
        </div>
        {lookupError && <p className="mt-2 text-sm text-red-700">{lookupError}</p>}
      </div>

      {preview && preview.existingJobId && (
        <div className="rounded-xl border border-sand bg-white/70 p-5">
          <p className="text-sm text-ink">This card already has a job.</p>
          <Link href={`/studio/jobs/${preview.existingJobId}`} className="mt-3 inline-block text-sm font-medium text-cocoa underline">
            Open the job
          </Link>
        </div>
      )}

      {preview && !preview.existingJobId && (
        <form action={action} className="space-y-5 rounded-2xl border border-sand bg-white/70 p-5 sm:p-6">
          <input type="hidden" name="cardRef" value={preview.cardId} />

          <div className="flex flex-wrap items-center gap-2 text-sm text-stone">
            <a href={preview.cardUrl} target="_blank" rel="noreferrer" className="font-medium text-cocoa underline">
              {preview.cardName}
            </a>
            <span>in “{preview.listName}”</span>
            {preview.doNotEmail && <Badge tone="danger">Do not email</Badge>}
          </div>

          {!preview.designer && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              This card isn’t in a designer’s list yet, so publishing won’t move it on Trello until it is.
            </p>
          )}

          <label className="block">
            <span className={label}>Customer name</span>
            <input name="customerName" defaultValue={preview.customerName} required className={input} />
          </label>
          <label className="block">
            <span className={label}>Customer email</span>
            <input name="customerEmail" type="email" defaultValue={preview.customerEmail} required className={input} />
          </label>
          <label className="block">
            <span className={label}>Designer</span>
            <select name="designerId" defaultValue={preview.designerId ?? ''} className={input}>
              <option value="">Not set</option>
              {designers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>

          <div>
            <span className={label}>Finger size</span>
            <p className="text-sm text-ink">
              {preview.ringSize ?? 'Not given'}{' '}
              <Badge tone={preview.ringSizeStatus === 'confirmed' ? 'ok' : 'warn'}>{preview.ringSizeStatus}</Badge>
            </p>
            {preview.ringSizeNote && <p className="mt-1 text-xs text-stone">Card says: “{preview.ringSizeNote}”</p>}
          </div>

          {state.error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>}
          <CreateButton />
        </form>
      )}
    </div>
  )
}
