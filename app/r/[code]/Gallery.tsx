'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'

type Render = { id: string; url: string; width: number | null; height: number | null }

/**
 * One large render with thumbnails underneath. On phones the main image
 * swipes left/right; tapping it opens the full-resolution file.
 */
export default function Gallery({ renders, alt }: { renders: Render[]; alt: string }) {
  const [index, setIndex] = useState(0)
  const touchX = useRef<number | null>(null)
  if (renders.length === 0) return null
  const current = renders[index]
  const go = (i: number) => setIndex((i + renders.length) % renders.length)

  return (
    <div>
      <div className="relative overflow-hidden rounded-2xl border border-sand bg-white"
        onTouchStart={e => { touchX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1))
        }}>
        <a href={current.url} target="_blank" rel="noreferrer" className="block">
          <Image key={current.id} src={current.url} alt={`${alt}, image ${index + 1} of ${renders.length}`}
            width={current.width ?? 1600} height={current.height ?? 1200}
            sizes="(min-width: 768px) 720px, 100vw" priority={index === 0}
            className="h-auto w-full" />
        </a>
        {renders.length > 1 && (
          <>
            <ArrowButton side="left" onClick={() => go(index - 1)} />
            <ArrowButton side="right" onClick={() => go(index + 1)} />
            <span className="absolute bottom-2 right-2 rounded-full bg-black/45 px-2 py-0.5 text-[11px] text-white">
              {index + 1} / {renders.length}
            </span>
          </>
        )}
      </div>

      {renders.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {renders.map((r, i) => (
            <button key={r.id} onClick={() => setIndex(i)} aria-label={`Show image ${i + 1}`}
              className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                i === index ? 'border-cocoa' : 'border-transparent opacity-70 hover:opacity-100'}`}>
              <Image src={r.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ArrowButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={side === 'left' ? 'Previous image' : 'Next image'}
      className={`absolute top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/85 text-lg text-cocoa shadow-sm hover:bg-white sm:flex ${
        side === 'left' ? 'left-3' : 'right-3'}`}>
      {side === 'left' ? '‹' : '›'}
    </button>
  )
}
