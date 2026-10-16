import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { SESSION_COOKIE, verifySession } from '@/lib/session'
import { getCard } from '@/lib/trello'
import { cardDetails, createJobFromDetails } from '@/lib/job-create'
import { isEmailOnlyName } from '@/lib/trello-parse'
import { recordIssue } from '@/lib/issues'

export const dynamic = 'force-dynamic'

/**
 * Target of the "Open in LAHER Studio" link on a Trello card. Opens the card's
 * job, creating it on the first click from the card's details as they are now.
 * Staff-only (middleware sends signed-out visitors to sign in, then back here).
 */
export async function GET(request: Request, { params }: { params: { ref: string } }) {
  const session = await verifySession(cookies().get(SESSION_COOKIE)?.value)
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url))
  if (!session) return to(`/studio/login?next=/studio/cards/${encodeURIComponent(params.ref)}`)

  try {
    const card = await getCard(params.ref)
    if (!card) return to(`/studio/new?error=card-not-found`)
    const d = await cardDetails(card)
    if (d.existingJobId) return to(`/studio/jobs/${d.existingJobId}`)

    // Details incomplete (e.g. renamed since the link was added): let staff check them
    if (!isEmailOnlyName(card.name) || !d.customerName || !d.customerEmail) return to(`/studio/new?card=${card.shortLink ?? params.ref}`)

    const jobId = await createJobFromDetails(d, {
      customerName: d.customerName, customerEmail: d.customerEmail, designerId: d.designerId,
      createdBy: session.staffId, via: 'trello_link',
    })
    return to(`/studio/jobs/${jobId}`)
  } catch (err) {
    await recordIssue({
      kind: 'trello_webhook', jobId: null, summary: `Open card ${params.ref} from its Studio link`,
      operation: null, error: err instanceof Error ? err.message : String(err),
    })
    return to(`/studio/new?card=${encodeURIComponent(params.ref)}&error=open-failed`)
  }
}
