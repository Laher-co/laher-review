'use client'

import { useState, useTransition } from 'react'
import { retryIssueAction, setIssueStatusAction } from '../../actions'
import { Spinner } from '@/components/brand'

export function IssueActions({ id, status, canRetry }: { id: string; status: 'open' | 'resolved' | 'ignored'; canRetry: boolean }) {
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  const btn = 'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm disabled:opacity-50'

  if (status !== 'open') {
    return (
      <div className="mt-3">
        <button className={`${btn} border border-sand bg-white text-cocoa`} disabled={pending}
          onClick={() => start(() => setIssueStatusAction(id, 'open'))}>Reopen</button>
      </div>
    )
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {canRetry && (
        <button className={`${btn} bg-cocoa text-ivory hover:bg-cocoa-dark`} disabled={pending}
          onClick={() => start(async () => {
            setNote(null)
            const res = await retryIssueAction(id)
            setNote(res.ok ? 'Worked: resolved.' : `Still failing: ${res.error}`)
          })}>
          {pending && <Spinner />} Retry
        </button>
      )}
      <button className={`${btn} border border-sand bg-white text-cocoa`} disabled={pending}
        onClick={() => start(() => setIssueStatusAction(id, 'resolved'))}>Mark resolved</button>
      <button className={`${btn} text-stone underline`} disabled={pending}
        onClick={() => start(() => setIssueStatusAction(id, 'ignored'))}>Ignore</button>
      {note && <span className={`text-sm ${note.startsWith('Worked') ? 'text-emerald-700' : 'text-red-700'}`}>{note}</span>}
    </div>
  )
}
