'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { signIn } from '../actions'
import { Spinner } from '@/components/brand'

function Submit() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="w-full rounded-lg bg-cocoa py-3.5 text-sm font-medium tracking-wide text-ivory transition-colors hover:bg-cocoa-dark disabled:opacity-60 flex items-center justify-center gap-2">
      {pending && <Spinner />} Sign in
    </button>
  )
}

export default function LoginForm({ people, next }: { people: { id: string; name: string }[]; next: string }) {
  const [state, action] = useFormState(signIn, {})

  return (
    <form action={action} className="rounded-2xl border border-sand bg-white/70 p-6 shadow-sm space-y-6">
      <input type="hidden" name="next" value={next} />

      <fieldset>
        <legend className="mb-3 text-xs font-semibold uppercase tracking-widest text-cocoa-light">Who are you?</legend>
        <div className="grid grid-cols-2 gap-2">
          {people.map(p => (
            <label key={p.id}
              className="cursor-pointer rounded-lg border border-sand bg-ivory px-3 py-3 text-center text-sm text-ink transition-colors has-[:checked]:border-cocoa has-[:checked]:bg-cocoa has-[:checked]:text-ivory">
              <input type="radio" name="staffId" value={p.id} className="sr-only" required />
              {p.name}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-cocoa-light">Staff password</span>
        <input type="password" name="password" required autoComplete="current-password"
          className="w-full rounded-lg border border-sand bg-white px-3 py-3 text-base text-ink focus:border-cocoa focus:outline-none" />
      </label>

      {state.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <Submit />
    </form>
  )
}
