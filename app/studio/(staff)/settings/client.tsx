'use client'

import { useState, useTransition } from 'react'
import { runBackfill, setDesignerOnStudio, type BackfillReport } from '../../actions'
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
