import { NextResponse } from 'next/server'
import { recordIssue } from '@/lib/issues'
import { ensureStudioLink, ORDER_BOARD_ID } from '@/lib/studio-links'
import { syncRingSizeFromCard } from '@/lib/ring-size-sync'
import { getMyMemberId, LABEL_DO_NOT_EMAIL } from '@/lib/trello'
import { syncDoNotEmail } from '@/lib/do-not-email'

export const dynamic = 'force-dynamic'

// Trello checks the callback with HEAD (and sometimes GET) when the webhook is created
export const HEAD = () => new Response(null, { status: 200 })
export const GET  = () => new Response('ok')

type TrelloAction = {
  type: string
  idMemberCreator?: string
  data: {
    customField?: { name?: string }
    card?: { id: string; name?: string }
    listAfter?: { id: string }
    list?: { id: string }
    old?: { name?: string; idList?: string; desc?: string }
    board?: { id: string }
    label?: { name?: string }
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

  // "Do not email" label added or removed in Trello: update the Studio switch
  if ((a.type === 'addLabelToCard' || a.type === 'removeLabelFromCard') &&
      a.data.label?.name?.trim().toLowerCase() === LABEL_DO_NOT_EMAIL.toLowerCase()) {
    try {
      return NextResponse.json({ ok: true, result: await syncDoNotEmail(a.data.card.id) })
    } catch (err) {
      await recordIssue({
        kind: 'trello_webhook', jobId: null,
        summary: `Update “Do not email” from card ${a.data.card.name ?? a.data.card.id}`,
        operation: null, error: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json({ ok: true, failed: true })
    }
  }

  // Finger size changed on the card: keep the job in step (latest change wins).
  // The app's own writes (as the Review App user) are ignored so it can't loop.
  const descEdit = a.type === 'updateCard' && typeof a.data.old?.desc === 'string'
  const fieldEdit = a.type === 'updateCustomFieldItem' && /^finger size/i.test(a.data.customField?.name ?? '')
  if (descEdit || fieldEdit) {
    try {
      if (a.idMemberCreator && a.idMemberCreator === await getMyMemberId()) return NextResponse.json({ ok: true, ignored: 'own change' })
      const result = await syncRingSizeFromCard(a.data.card.id,
        descEdit ? { kind: 'description', oldDesc: a.data.old!.desc! } : { kind: 'fields' })
      return NextResponse.json({ ok: true, result })
    } catch (err) {
      await recordIssue({
        kind: 'trello_webhook', jobId: null,
        summary: `Sync the ring size from card ${a.data.card.name ?? a.data.card.id}`,
        operation: null, error: err instanceof Error ? err.message : String(err),
      })
      return NextResponse.json({ ok: true, failed: true })
    }
  }

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
