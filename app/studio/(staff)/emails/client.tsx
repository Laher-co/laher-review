'use client'

import { useState } from 'react'

export function EmailPreview({ when, subject, html }: { when: string; subject: string; html: string }) {
  const [width, setWidth] = useState<'phone' | 'desktop'>('phone')
  return (
    <section className="rounded-2xl border border-sand bg-white/70 p-4 sm:p-5">
      <p className="text-xs uppercase tracking-widest text-cocoa-light">{when}</p>
      <p className="mt-1 text-[15px] text-ink"><span className="text-stone">Subject:</span> {subject}</p>
      <div className="mt-3 flex gap-1 text-xs">
        {(['phone', 'desktop'] as const).map(w => (
          <button key={w} onClick={() => setWidth(w)}
            className={`rounded-md px-2.5 py-1 ${width === w ? 'bg-cocoa text-ivory' : 'border border-sand text-cocoa-light'}`}>{w === 'phone' ? 'Phone' : 'Desktop'}</button>
        ))}
      </div>
      <div className="mt-3 overflow-x-auto">
        <iframe title={subject} srcDoc={html} sandbox=""
          className="h-[640px] rounded-xl border border-sand bg-white"
          style={{ width: width === 'phone' ? 375 : 680 }} />
      </div>
    </section>
  )
}
