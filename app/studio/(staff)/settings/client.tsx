'use client'

import Image from 'next/image'
import { useRef, useState, useTransition } from 'react'
import { upload } from '@vercel/blob/client'
import { addDesigner, removeDesigner, runBackfill, saveSettingImage, setDesignerOnStudio, type AddDesignerReport, type BackfillReport } from '../../actions'
import { SETTING_COPY, type SettingChoice } from '@/lib/setting'
import SettingIllustration from '@/components/SettingIllustration'
import { Badge, Spinner } from '@/components/brand'

const RESULT_LABEL: Record<string, string> = {
  added: 'Link added', already_linked: 'Already linked', skipped: 'Skipped', failed: 'Failed (see Issues)',
}

export function DesignerToggle({ staffId, name, on, canEdit }: { staffId: string; name: string; on: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition()
  const [report, setReport] = useState<BackfillReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = (fn: () => Promise<BackfillReport | null>) => start(async () => {
    setError(null)
    try { setReport(await fn()) } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.') }
  })

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-ink">{name}</span>
        <Badge tone={on ? 'ok' : 'neutral'}>{on ? 'On LAHER Studio' : 'Old system'}</Badge>
        {canEdit && (
          <span className="ml-auto flex items-center gap-2">
            {pending && <Spinner className="text-cocoa" />}
            {on && (
              <button className="text-sm text-cocoa underline" disabled={pending} onClick={() => act(() => runBackfill(staffId))}>
                Re-run backfill
              </button>
            )}
            <button className="text-sm text-stone underline" disabled={pending}
              onClick={() => {
                if (!confirm(`Remove ${name}? They’ll disappear from the name picker and this list. Their Trello lists and jobs stay as they are.`)) return
                act(async () => { await removeDesigner(staffId); return null })
              }}>
              Remove
            </button>
            <button disabled={pending}
              onClick={() => {
                if (!on && !confirm(`Switch ${name} onto LAHER Studio? Cards now in ${name}’s New Design Renders list will get an “Open in LAHER Studio” link.`)) return
                act(() => setDesignerOnStudio(staffId, !on))
              }}
              className={`rounded-lg px-3.5 py-2 text-sm ${on ? 'border border-sand bg-white text-cocoa' : 'bg-cocoa text-ivory hover:bg-cocoa-dark'}`}>
              {on ? 'Switch off' : 'Switch on'}
            </button>
          </span>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {report && (
        <div className="mt-3 rounded-lg border border-sand bg-ivory p-3 text-sm">
          {report.list === null
            ? <p className="text-amber-800">No “{name} | New Design Renders” list found on the board.</p>
            : <>
                <p className="text-stone">Backfill of “{report.list}”: {report.results.length} card{report.results.length === 1 ? '' : 's'}</p>
                <ul className="mt-2 space-y-1">
                  {report.results.map((r, i) => (
                    <li key={i}><span className="text-ink">{r.card}</span> · {RESULT_LABEL[r.result.action]}
                      {'reason' in r.result ? ` (${r.result.reason})` : ''}{'error' in r.result ? `: ${r.result.error}` : ''}</li>
                  ))}
                </ul>
              </>}
        </div>
      )}
    </div>
  )
}

const LIST_RESULT: Record<AddDesignerReport['lists'][number]['result'], string> = {
  created: 'Created', existing: 'Already on the board (used as is)', failed: 'Failed (see Issues)',
}

/** Ryan only: adds a designer's four Trello lists and puts them in the studio, switched off. */
export function AddDesigner() {
  const [pending, start] = useTransition()
  const [name, setName] = useState('')
  const [report, setReport] = useState<AddDesignerReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const submit = () => start(async () => {
    setError(null); setReport(null)
    try { setReport(await addDesigner(name)); setName('') } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong.') }
  })
  return (
    <div className="mt-5 border-t border-sand pt-5">
      <h3 className="text-sm font-semibold uppercase tracking-widest text-cocoa-light">Add designer</h3>
      <form className="mt-2 flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); submit() }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Designer’s name" maxLength={40}
          className="flex-1 rounded-lg border border-sand bg-white px-3 py-2.5 text-base focus:border-cocoa focus:outline-none sm:text-sm" />
        <button type="submit" disabled={pending || !name.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-cocoa px-4 py-2.5 text-sm text-ivory hover:bg-cocoa-dark disabled:opacity-50">
          {pending && <Spinner />} Add
        </button>
      </form>
      <p className="mt-1.5 text-xs text-stone">Creates their four lists on the Order Management board after the last designer, and adds them to the name picker, switched off.</p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {report && (
        <div className="mt-3 rounded-lg border border-sand bg-ivory p-3 text-sm">
          <p className="text-ink"><strong>{report.name}</strong> {report.staff === 'restored' ? 'is back in the studio' : 'added to the studio'} (switched off).</p>
          <ul className="mt-2 space-y-1">
            {report.lists.map(l => (
              <li key={l.stage} className={l.result === 'failed' ? 'text-red-700' : 'text-stone'}>
                <span className="text-ink">{l.name}</span> · {LIST_RESULT[l.result]}{l.error ? `: ${l.error}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Ryan only: the photo for one setting option. Uploaded straight to Blob, then saved. */
export function SettingImageSlot({ choice, url }: { choice: SettingChoice; url: string | null }) {
  const input = useRef<HTMLInputElement>(null)
  const [pending, start] = useTransition()
  const [pct, setPct] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onFile = (file: File | undefined) => {
    if (!file) return
    setError(null)
    start(async () => {
      try {
        const safe = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')
        setPct(0)
        const blob = await upload(`settings/${choice}/${safe}`, file, {
          access: 'public', handleUploadUrl: '/api/staff/upload',
          clientPayload: JSON.stringify({ settingImage: choice }),
          onUploadProgress: ({ percentage }) => setPct(Math.round(percentage)),
        })
        await saveSettingImage(choice, { url: blob.url, pathname: blob.pathname })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.')
      } finally {
        setPct(null)
        if (input.current) input.current.value = ''
      }
    })
  }

  return (
    <div className="overflow-hidden rounded-xl border border-sand bg-white">
      <div className="relative aspect-[16/11] bg-linen">
        {url
          ? <Image src={url} alt={SETTING_COPY[choice].title} fill sizes="320px" className="object-cover" />
          : <SettingIllustration choice={choice} className="h-full w-full" />}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-cocoa-dark">{SETTING_COPY[choice].title}</p>
        <p className="mt-0.5 text-xs text-stone">{url ? 'Your photo' : 'Placeholder illustration'}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden"
            onChange={e => onFile(e.target.files?.[0])} />
          <button type="button" disabled={pending} onClick={() => input.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-cocoa px-3 py-2 text-xs text-ivory hover:bg-cocoa-dark disabled:opacity-50">
            {pending && <Spinner />}{pct !== null ? `Uploading ${pct}%` : url ? 'Replace image' : 'Upload image'}
          </button>
          {url && (
            <button type="button" disabled={pending}
              onClick={() => start(async () => { try { await saveSettingImage(choice, null) } catch (e) { setError(e instanceof Error ? e.message : 'Failed.') } })}
              className="rounded-lg border border-sand px-3 py-2 text-xs text-cocoa hover:bg-linen disabled:opacity-50">
              Use placeholder
            </button>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    </div>
  )
}
