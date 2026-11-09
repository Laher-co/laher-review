'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'
import { SETTING_CHOICES, SETTING_COPY, type SettingChoice } from '@/lib/setting'
import SettingIllustration from '@/components/SettingIllustration'
import Lightbox, { type LightboxImage } from '@/components/Lightbox'
import { Spinner } from '@/components/brand'
import { chooseSetting } from '../actions'

type Images = Record<SettingChoice, string | null>

function ZoomIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21M10.5 7.5v6M7.5 10.5h6" />
    </svg>
  )
}

/** The option's photo (or placeholder drawing). With a photo, tapping opens the full-screen viewer. */
function SettingImage({ choice, images, priority, onZoom }: {
  choice: SettingChoice; images: Images; priority?: boolean; onZoom?: () => void
}) {
  const url = images[choice]
  const copy = SETTING_COPY[choice]
  // Photos are square renders (two views): shown whole; the placeholder drawing is wider
  const frame = `relative block w-full overflow-hidden bg-linen ${url ? 'aspect-square' : 'aspect-[16/11]'}`
  if (!url) return <span className={frame}><SettingIllustration choice={choice} className="h-full w-full" /></span>
  const img = (
    <Image src={url} alt={`${copy.heading}: ${copy.subheading}`} fill sizes="(min-width: 640px) 360px, 100vw" priority={priority}
      className="object-contain transition-transform duration-500 ease-out [@media(hover:hover)]:group-hover/img:scale-[1.04]" />
  )
  if (!onZoom) return <span className={frame}>{img}</span>
  return (
    <button type="button" onClick={onZoom} aria-label={`Zoom in on ${copy.heading}`}
      className={`${frame} group/img cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cocoa`}>
      {img}
      <span className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-cocoa shadow-sm ring-1 ring-sand">
        <ZoomIcon />
      </span>
    </button>
  )
}

export default function SettingChooser({ code, initial, locked, images }: {
  code: string; initial: SettingChoice | null; locked: boolean; images: Images
}) {
  const [chosen, setChosen] = useState<SettingChoice | null>(initial)
  const [changing, setChanging] = useState(false)
  const [pendingChoice, setPendingChoice] = useState<SettingChoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, start] = useTransition()
  const [zoom, setZoom] = useState<number | null>(null)
  // The viewer swipes between both photos (placeholders aren't zoomable)
  const photos = SETTING_CHOICES.filter(c => images[c])
  const gallery: LightboxImage[] = photos.map(c => ({
    url: images[c]!, alt: SETTING_COPY[c].heading, caption: `${SETTING_COPY[c].heading} · ${SETTING_COPY[c].subheading}`,
  }))
  const zoomTo = (c: SettingChoice) => images[c] ? () => setZoom(photos.indexOf(c)) : undefined
  const viewer = zoom !== null && <Lightbox images={gallery} start={zoom} onClose={() => setZoom(null)} />

  const choose = (c: SettingChoice) => {
    if (pendingChoice) return
    setError(null)
    setPendingChoice(c)
    start(async () => {
      try {
        const r = await chooseSetting(code, c)
        if (r.ok) { setChosen(c); setChanging(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }
        else setError(r.error)
      } catch {
        setError('Something went wrong. Please try again.')
      } finally {
        setPendingChoice(null)
      }
    })
  }

  // Answered: thank you, with the chosen image
  if (chosen && !changing) {
    const copy = SETTING_COPY[chosen]
    return (
      <div className="mt-8" role="status">
        <div className="overflow-hidden rounded-2xl border border-cocoa/25 bg-white shadow-[0_1px_0_rgba(74,48,34,0.04)]">
          <SettingImage choice={chosen} images={images} priority onZoom={zoomTo(chosen)} />
          <div className="px-5 py-6 text-center sm:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cocoa-light">Your choice</p>
            <p className="mt-2 font-serif text-[1.6rem] leading-snug text-cocoa-dark">Thank you, we’ve noted that</p>
            <p className="mt-3 text-[13px] font-semibold tracking-[0.18em] text-cocoa-dark">{copy.heading}</p>
            <p className="mt-0.5 text-[15px] text-ink">{copy.subheading}</p>
          </div>
        </div>
        {locked ? (
          <p className="mt-4 text-center text-sm text-stone">Your design is underway with this setting.</p>
        ) : (
          <button type="button" onClick={() => setChanging(true)}
            className="mx-auto mt-4 block rounded-xl px-4 py-3 text-sm text-cocoa underline underline-offset-4 hover:text-cocoa-dark">
            Change my answer
          </button>
        )}
        {viewer}
      </div>
    )
  }

  return (
    <div className="mt-8">
      <p className="text-[15px] text-stone">Tap an image to see it up close, then choose the style you prefer.</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {SETTING_CHOICES.map((c, i) => {
          const copy = SETTING_COPY[c]
          // Highlighted only once chosen (when changing an earlier answer); identical before that
          const current = chosen === c
          const busy = pendingChoice === c
          return (
            <div key={c} className={`flex flex-col overflow-hidden rounded-2xl border bg-white transition
              ${current ? 'border-cocoa ring-1 ring-cocoa' : 'border-sand'} ${pendingChoice && !busy ? 'opacity-60' : ''}`}>
              <SettingImage choice={c} images={images} priority={i === 0} onZoom={zoomTo(c)} />
              <div className="flex flex-1 flex-col px-5 pb-5 pt-5">
                <h2 className="text-[15px] font-semibold tracking-[0.2em] text-cocoa-dark">{copy.heading}</h2>
                <p className="mt-1 font-serif text-[1.3rem] leading-snug text-cocoa">{copy.subheading}</p>
                <ul className="mt-3 space-y-2 text-[14.5px] leading-relaxed text-ink">
                  {copy.points.map(p => (
                    <li key={p} className="flex gap-2.5"><span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-cocoa-light" /><span>{p}</span></li>
                  ))}
                </ul>
                <div className="mt-auto pt-5">
                  <button type="button" onClick={() => choose(c)} disabled={!!pendingChoice || current} aria-pressed={current}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-cocoa px-4 py-3.5 text-[15px] font-medium tracking-wide text-ivory transition-colors hover:bg-cocoa-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-cocoa focus-visible:ring-offset-2 disabled:cursor-default">
                    {busy && <Spinner />}{current ? 'Your current choice' : 'Choose this style'}
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {changing && (
        <button type="button" onClick={() => setChanging(false)}
          className="mx-auto mt-4 block rounded-xl px-4 py-3 text-sm text-stone underline underline-offset-4 hover:text-cocoa">
          Keep my current choice
        </button>
      )}
      {error && <p className="mt-4 text-center text-sm text-red-700" role="alert">{error}</p>}
      {viewer}
    </div>
  )
}
