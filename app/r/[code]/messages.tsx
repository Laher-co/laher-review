'use client'

import Image from 'next/image'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { renderDrawingJpeg, type Stroke } from '@/components/DrawingCanvas'
import LightboxThumbs from '@/components/LightboxThumbs'
import { Spinner } from '@/components/brand'
import { DrawEditor, Sheet } from './client'
import { sendCustomerMessage, uploadAnnotation } from './actions'

export type ThreadMessage = {
  id: string
  author: 'customer' | 'staff'
  staffName: string | null
  body: string
  drawings: string[]
  when: string
  byEmail: boolean
  attachments: { url: string; name: string; isImage: boolean }[]
}
type Render = { id: string; url: string }

// Unsent text and drawings stay on the device until sent (drawings as strokes)
type Draft = { body: string; drawings: Record<string, Stroke[]>; clientKey: string }
const newKey = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)

/**
 * A conversation with the studio: one per version (with drawing on that
 * version's renders) plus a general thread. Always open, whatever the stage.
 */
export default function MessageThread({ code, versionId, heading, intro, placeholder, messages, renders }: {
  code: string
  versionId: string | null
  heading: string
  intro: string
  placeholder: string
  messages: ThreadMessage[]
  renders: Render[]
}) {
  const router = useRouter()
  const key = `laher-review-msg:${code}:${versionId ?? 'general'}`
  const [draft, setDraft] = useState<Draft>({ body: '', drawings: {}, clientKey: newKey() })
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<Render | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  // Restore a saved draft after mount (localStorage isn't available on the server)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key)
      if (saved) setDraft(d => ({ ...d, ...JSON.parse(saved) }))
    } catch {}
  }, [key])
  useEffect(() => {
    try {
      if (draft.body || Object.keys(draft.drawings).length) localStorage.setItem(key, JSON.stringify(draft))
      else localStorage.removeItem(key)
    } catch {}
  }, [key, draft])
  useEffect(() => {
    for (const [id, strokes] of Object.entries(draft.drawings)) {
      if (previews[id]) continue
      const r = renders.find(x => x.id === id)
      if (r) renderDrawingJpeg(r.url, strokes).then(b => b && setPreviews(p => ({ ...p, [id]: URL.createObjectURL(b) })))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.drawings])

  const drawingCount = Object.keys(draft.drawings).length
  const canSend = (draft.body.trim() || drawingCount > 0) && !pending

  function send() {
    setError(null)
    start(async () => {
      try {
        const annotations = []
        for (const [renderId, strokes] of Object.entries(draft.drawings)) {
          const r = renders.find(x => x.id === renderId)
          if (!r) continue
          const jpeg = await renderDrawingJpeg(r.url, strokes)
          if (!jpeg) throw new Error('One of your drawings couldn’t be prepared. Please try again.')
          const form = new FormData()
          form.set('renderId', renderId)
          form.set('file', jpeg, 'drawing.jpg')
          const up = await uploadAnnotation(code, form)
          if ('error' in up) throw new Error(up.error)
          annotations.push({ renderId, drawingUrl: up.drawingUrl, strokes })
        }
        const res = await sendCustomerMessage(code, { clientKey: draft.clientKey, versionId, body: draft.body, annotations })
        if (!res.ok) throw new Error(res.error)
        setDraft({ body: '', drawings: {}, clientKey: newKey() })
        setPreviews({})
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Your message didn’t send. Please try again.')
      }
    })
  }

  return (
    <div className="rounded-2xl border border-sand bg-white/70 p-4 sm:p-5">
      <h3 className="font-serif text-xl text-cocoa-dark">{heading}</h3>
      <p className="mt-0.5 text-sm text-stone">{intro}</p>

      {messages.length > 0 && (
        <ol className="mt-4 space-y-3">
          {messages.map(m => {
            const mine = m.author === 'customer'
            return (
              <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${mine ? 'rounded-br-md bg-cocoa text-ivory' : 'rounded-bl-md border border-sand bg-white text-ink'}`}>
                  <p className={`mb-1 text-[11px] uppercase tracking-wider ${mine ? 'text-ivory/70' : 'text-cocoa-light'}`}>
                    {mine ? 'You' : `${m.staffName ?? 'LAHER'} · LAHER Studio`} · {m.when}{m.byEmail && ' · by email'}
                  </p>
                  {m.body && <p className="whitespace-pre-line text-[15px] leading-relaxed">{m.body}</p>}
                  {m.drawings.length > 0 && (
                    <LightboxThumbs className="mt-2 grid grid-cols-3 gap-1.5" sizes="25vw"
                      images={m.drawings.map((u, i) => ({ url: u, alt: `Drawing ${i + 1}`, caption: mine ? 'Your drawing' : 'Drawing' }))} />
                  )}
                  {m.attachments.some(a => a.isImage) && (
                    <LightboxThumbs className="mt-2 grid grid-cols-3 gap-1.5" sizes="25vw"
                      images={m.attachments.filter(a => a.isImage).map(a => ({ url: a.url, alt: a.name, caption: a.name }))} />
                  )}
                  {m.attachments.filter(a => !a.isImage).map(a => (
                    <a key={a.url} href={a.url} target="_blank" rel="noreferrer" className="mt-1.5 block text-sm underline">📎 {a.name}</a>
                  ))}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-4">
        <textarea value={draft.body} rows={3} maxLength={4000} placeholder={placeholder}
          onChange={e => { const v = e.target.value; setDraft(d => ({ ...d, body: v })) }}
          className="w-full rounded-xl border border-sand bg-white px-3 py-3 text-base focus:border-cocoa focus:outline-none" />

        {drawingCount > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {Object.keys(draft.drawings).map(id => (
              <div key={id} className="relative h-16 w-16 overflow-hidden rounded-lg border border-sand bg-white">
                {previews[id] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[id]} alt="Your drawing" className="h-full w-full object-cover" />
                )}
                <button type="button" aria-label="Remove drawing"
                  onClick={() => setDraft(d => { const drawings = { ...d.drawings }; delete drawings[id]; return { ...d, drawings } })}
                  className="absolute right-0.5 top-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white">✕</button>
              </div>
            ))}
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-2 flex items-center gap-3">
          {renders.length > 0 && (
            <button type="button" onClick={() => setPicking(true)}
              className="rounded-xl border border-sand bg-white px-4 py-3 text-sm text-cocoa hover:bg-linen">
              ✎ Draw on the design
            </button>
          )}
          <button type="button" onClick={send} disabled={!canSend}
            className="ml-auto flex items-center gap-2 rounded-xl bg-cocoa px-6 py-3 text-sm font-medium text-ivory hover:bg-cocoa-dark disabled:opacity-50">
            {pending && <Spinner />} Send
          </button>
        </div>
      </div>

      {picking && !editing && (
        <Sheet title="Choose an image to draw on" onClose={() => setPicking(false)}>
          <div className="grid grid-cols-2 gap-3">
            {renders.map(r => (
              <button key={r.id} type="button" onClick={() => setEditing(r)}
                className="relative aspect-square overflow-hidden rounded-xl border-2 border-sand bg-white">
                <Image src={r.url} alt="" fill sizes="45vw" className="object-cover" />
                {draft.drawings[r.id] && <span className="absolute bottom-2 left-2 rounded-full bg-cocoa px-2.5 py-1 text-xs text-ivory">Drawn ✓</span>}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {editing && (
        <DrawEditor render={editing} initial={draft.drawings[editing.id]}
          onCancel={() => setEditing(null)}
          onSave={(strokes, preview) => {
            const id = editing.id
            setDraft(d => {
              const drawings = { ...d.drawings }
              if (strokes.length) drawings[id] = strokes
              else delete drawings[id]
              return { ...d, drawings }
            })
            setPreviews(p => { const n = { ...p }; if (preview) n[id] = preview; else delete n[id]; return n })
            setEditing(null)
            setPicking(false)
          }} />
      )}
    </div>
  )
}
