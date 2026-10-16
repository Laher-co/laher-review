import { NextResponse } from 'next/server'
import { recordIssue } from '@/lib/issues'
import { ensureStudioLink, ORDER_BOARD_ID } from '@/lib/studio-links'

export const dynamic = 'force-dynamic'

// Trello checks the callback with HEAD (and sometimes GET) when the webhook is created
export const HEAD = () => new Response(null, { status: 200 })
export const GET  = () => new Response('ok')

type TrelloAction = {
  type: string
  data: {
    card?: { id: string; name?: string }
    listAfter?: { id: string }
    list?: { id: string }
    old?: { name?: string; idList?: string }
    board?: { id: string }
  }
}

/**
 * Trello webhook for the Order Management board (registered with the LAHER
 * Review App user). The payload is only used as a hint: every decision is
 * made from the card as it is right now in Trello, so a forged or out-of-date
 * event can't put a link on the wrong card.
 */
export async function POST(request: Request) {
  let body: { action?: TrelloAction; model?: { id: string } }
  try { body = await request.json() } catch { return NextResponse.json({ ok: true }) }
  const a = body.action
  if (!a?.data?.card?.id || body.model?.id !== ORDER_BOARD_ID) return NextResponse.json({ ok: true })

  // Card arrived in a list (created, copied, moved, converted) or was renamed
  const relevant =
    ['createCard', 'copyCard', 'moveCardToBoard', 'convertToCardFromCheckItem', 'emailCard'].includes(a.type) ||
    (a.type === 'updateCard' && (!!a.data.listAfter || a.data.old?.name !== undefined || a.data.old?.idList !== undefined))
  if (!relevant) return NextResponse.json({ ok: true })

  try {
    const result = await ensureStudioLink(a.data.card.id)
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    // Always answer 200 so Trello doesn't disable the webhook; the failure is logged
    await recordIssue({
      kind: 'trello_webhook', jobId: null,
      summary: `Handle Trello “${a.type}” for card ${a.data.card.name ?? a.data.card.id}`,
      operation: { type: 'trello.studioLink', args: { cardId: a.data.card.id } },
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({ ok: true, failed: true })
  }
}
