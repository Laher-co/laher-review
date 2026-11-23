import { ALERT_FROM_DAYS, plural, shortDay, type CastingState } from '@/lib/casting'

/** Studio job page: amber countdown, or red once past the cast date. */
export function StaffCastingAlert({ state, mismatch }: { state: CastingState; mismatch: string | null }) {
  const past = state.kind === 'past'
  const title = state.kind === 'countdown' ? `Casting date · ${plural(state.daysLeft, 'business day')}`
    : state.kind === 'today' ? 'Casting date · today'
    : `Past casting date${state.daysOver ? ` · ${plural(state.daysOver, 'business day')} over` : ''}`
  const dates = past
    ? `Should have cast ${shortDay(state.cast)} · Due ${shortDay(state.due)}`
    : `Cast by ${state.kind === 'today' ? 'today' : shortDay(state.cast)} · Due ${shortDay(state.due)}`
  return (
    <div role="alert" className={`rounded-2xl border-2 px-5 py-4 shadow-sm sm:px-6 ${past ? 'border-red-700 bg-red-700 text-white' : 'border-amber-600 bg-amber-500 text-amber-950'}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-lg font-bold uppercase tracking-wide sm:text-xl">{title}</p>
        <p className="text-sm font-medium sm:text-base">{dates}</p>
      </div>
      {mismatch && <p className={`mt-2 text-sm font-semibold ${past ? 'text-white' : 'text-amber-950'}`}>Date mismatch: check the due date.</p>}
    </div>
  )
}

/** Job list badge text and tone. */
export function castingBadge(state: CastingState): { label: string; tone: 'warn' | 'danger' } {
  if (state.kind === 'past') return { label: 'Past casting date', tone: 'danger' }
  if (state.kind === 'today') return { label: 'Cast today', tone: 'warn' }
  return { label: `Cast in ${plural(state.daysLeft, 'day')}`, tone: 'warn' }
}

/** Customer design page, under the stage banner. No buttons, links or questions. */
export function CustomerCastingCard({ state }: { state: CastingState }) {
  const past = state.kind === 'past'
  const heading = state.kind === 'countdown' ? `${plural(state.daysLeft, 'day')} to go`
    : state.kind === 'today' ? 'Casting today'
    : 'Getting as close to your date as we can'
  const text = state.kind === 'past'
    ? 'We’re working to have your ring ready as soon as possible.'
    : `To have your ring ready in time, we’ll aim to send it to cast ${state.kind === 'today' ? 'today' : `within ${plural(state.daysLeft, 'day')}`}.`
  const filled = state.kind === 'countdown' ? state.daysLeft : 0
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="rounded-2xl border border-sand bg-white/80 px-5 py-5 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cocoa-light">Casting date</p>
        <p className="mt-1.5 font-serif text-[1.6rem] leading-snug text-cocoa-dark">{heading}</p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-ink">{text}</p>
        {!past && (
          <div className="mt-4 flex gap-1.5" role="img" aria-label={`${filled} of ${ALERT_FROM_DAYS} days left`}>
            {Array.from({ length: ALERT_FROM_DAYS }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i < filled ? 'bg-cocoa' : 'bg-sand'}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
