'use client'

import { useEffect, useState } from 'react'

/**
 * The "Your brief" container, collapsed by default.
 * Phone: one row ("Your brief ›") that expands in place.
 * Desktop: a slim tab on the right edge that opens a side panel.
 * The content is rendered once, only while open.
 */
export function BriefShell({ toDo, initialOpen, children }: { toDo: number; initialOpen: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(initialOpen)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const badge = toDo > 0 && (
    <span className="rounded-full bg-amber-700 px-2 py-0.5 text-[11px] font-semibold text-white">{toDo} to answer</span>
  )

  return (
    <>
      {/* Phone: a single row in the page */}
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls="your-brief"
        className="mt-6 flex w-full items-center justify-between gap-3 rounded-xl border border-sand bg-white/70 px-4 py-3.5 text-left lg:hidden">
        <span className="flex items-center gap-2.5">
          <span className="text-[13px] font-semibold uppercase tracking-[0.2em] text-cocoa-dark">Your brief</span>
          {badge}
        </span>
        <span aria-hidden className={`text-xl text-cocoa-light transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
      </button>

      {/* Desktop: a slim tab on the right edge */}
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-expanded={false} aria-controls="your-brief"
          className="fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 flex-col items-center gap-2 rounded-l-xl border border-r-0 border-sand bg-white px-2.5 py-4 shadow-sm hover:bg-linen lg:flex">
          <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-cocoa-dark [writing-mode:vertical-rl] rotate-180">Your brief</span>
          {toDo > 0 && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-700 text-[11px] font-semibold text-white" aria-label={`${toDo} to answer`}>{toDo}</span>}
        </button>
      )}

      {open && (
        <aside id="your-brief" aria-label="Your brief"
          className="mt-2 rounded-xl border border-sand bg-white/70 px-4 pb-2 pt-4
            lg:fixed lg:inset-y-0 lg:right-0 lg:z-40 lg:mt-0 lg:w-[420px] lg:overflow-y-auto lg:rounded-none lg:border-y-0 lg:border-r-0 lg:bg-ivory lg:px-6 lg:pt-6 lg:shadow-[-8px_0_24px_rgba(74,48,34,0.08)]">
          <div className="mb-3 hidden items-start justify-between gap-3 lg:flex">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.2em] text-cocoa-dark">Your brief</p>
              <p className="mt-0.5 text-sm text-stone">What you told us before design began.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close"
              className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-2xl text-stone hover:bg-linen">×</button>
          </div>
          <p className="mb-2 text-sm text-stone lg:hidden">What you told us before design began.</p>
          {children}
        </aside>
      )}
    </>
  )
}
