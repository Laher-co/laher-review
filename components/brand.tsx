import Link from 'next/link'

export function Wordmark({ href, className = '' }: { href?: string; className?: string }) {
  const mark = (
    <span className={`font-serif text-[1.35rem] tracking-[0.32em] text-cocoa-dark ${className}`}>LAHER</span>
  )
  return href ? <Link href={href}>{mark}</Link> : mark
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

const BADGE_TONES = {
  neutral: 'bg-linen text-cocoa-light border-sand',
  cocoa:   'bg-cocoa text-ivory border-cocoa',
  warn:    'bg-amber-50 text-amber-800 border-amber-200',
  danger:  'bg-red-50 text-red-700 border-red-200',
  ok:      'bg-emerald-50 text-emerald-800 border-emerald-200',
} as const

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  )
}
