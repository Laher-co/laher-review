'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'
import { SETTING_CHOICES, SETTING_COPY, type SettingChoice } from '@/lib/setting'
import SettingIllustration from '@/components/SettingIllustration'
import { Spinner } from '@/components/brand'
import { chooseSetting } from '../actions'

type Images = Record<SettingChoice, string | null>

function SettingImage({ choice, images, priority }: { choice: SettingChoice; images: Images; priority?: boolean }) {
  const url = images[choice]
  return (
    <span className="relative block aspect-[16/11] w-full overflow-hidden bg-linen">
      {url
        ? <Image src={url} alt={SETTING_COPY[choice].title} fill sizes="(min-width: 640px) 360px, 100vw" className="object-cover" priority={priority} />
        : <SettingIllustration choice={choice} className="h-full w-full" />}
    </span>
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
          <SettingImage choice={chosen} images={images} priority />
          <div className="px-5 py-6 text-center sm:px-8">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cocoa-light">Your choice</p>
            <p className="mt-2 font-serif text-[1.6rem] leading-snug text-cocoa-dark">Thank you, we’ve noted that</p>
            <p className="mt-2 text-[15px] text-ink">{copy.title}</p>
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
      </div>
    )
  }

  return (
    <div className="mt-8">
      <p className="text-[15px] text-stone">Tap the one you prefer.</p>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {SETTING_CHOICES.map((c, i) => {
          const copy = SETTING_COPY[c]
          const current = chosen === c
          const busy = pendingChoice === c
          return (
            <button key={c} type="button" onClick={() => choose(c)} disabled={!!pendingChoice}
              aria-pressed={current}
              className={`group flex flex-col overflow-hidden rounded-2xl border bg-white text-left transition
                focus:outline-none focus-visible:ring-2 focus-visible:ring-cocoa focus-visible:ring-offset-2 focus-visible:ring-offset-ivory
                disabled:cursor-wait ${current ? 'border-cocoa ring-1 ring-cocoa' : 'border-sand hover:border-cocoa/50 hover:shadow-md'}
                ${pendingChoice && !busy ? 'opacity-60' : ''}`}>
              <SettingImage choice={c} images={images} priority={i === 0} />
              <span className="flex flex-1 flex-col px-5 pb-5 pt-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cocoa-light">Option {i + 1}</span>
                <span className="mt-1 font-serif text-[1.35rem] leading-snug text-cocoa-dark">{copy.title}</span>
                {/* spans, not a list: a button may only hold inline content */}
                <span className="mt-3 block space-y-2 text-[14.5px] leading-relaxed text-ink">
                  {copy.points.map(p => (
                    <span key={p} className="flex gap-2.5"><span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-cocoa-light" /><span>{p}</span></span>
                  ))}
                </span>
                <span className={`mt-5 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-medium tracking-wide transition-colors
                  ${current ? 'bg-cocoa text-ivory' : 'border border-cocoa/40 text-cocoa group-hover:bg-linen'}`}>
                  {busy && <Spinner />}{current ? 'Your current choice' : 'Choose this setting'}
                </span>
              </span>
            </button>
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
    </div>
  )
}
