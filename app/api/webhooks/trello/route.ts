import { NextResponse } from 'next/server'
import { recordIssue } from '@/lib/issues'
import { ensureStudioLink, ORDER_BOARD_ID } from '@/lib/studio-links'
import { syncRingSizeFromCard } from '@/lib/ring-size-sync'
import { getCard, getMyMemberId, LABEL_DO_NOT_EMAIL } from '@/lib/trello'
import { syncDoNotEmail } from '@/lib/do-not-email'
import { detectStone, handleSourcingMove, syncStoneFromLabel } from '@/lib/stone-sync'
import { isSourcingList, LABEL_STONE } from '@/lib/stone'
import { FLAGS, releaseHold, syncFlagFromLabel, type FlagKey } from '@/lib/job-flags'
import { parseDesignerList } from '@/lib/trello-parse'
import { eq } from 'drizzle-orm'
import { db, jobs } from '@/lib/db'

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
    listAfter?: { id: string; name?: string }
    listBefore?: { id: string; name?: string }
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

  // "STONE NEEDS SOURCING" label added or removed in Trello: update the "Stone not secured" switch
  if ((a.type === 'addLabelToCard' || a.type === 'removeLabelFromCard') &&
      a.data.label?.name?.trim().toLowerCase() === LABEL_STONE.toLowerCase()) {
    try {
      return NextResponse.json({ ok: true, result: await syncStoneFromLabel(a.data.card.id) })
    } catch (err) {
      await recordIssue({
        kind: 'trello_webhook', jobId: null, operation: null, error: err instanceof Error ? err.message : String(err),
        summary: `Update “Stone not secured” from card ${a.data.card.name ?? a.data.card.id}`,
      })
      return NextResponse.json({ ok: true, failed: true })
    }
  }

  // "SIDE STONES NOT CONFIRMED" or "Concept Renders" label added or removed in Trello: the switch follows
  const flagKey = (Object.keys(FLAGS) as FlagKey[]).find(k => a.data.label?.name?.trim().toLowerCase() === FLAGS[k].label.toLowerCase())
  if ((a.type === 'addLabelToCard' || a.type === 'removeLabelFromCard') && flagKey) {
    try {
      return NextResponse.json({ ok: true, result: await syncFlagFromLabel(a.data.card.id, flagKey) })
    } catch (err) {
      await recordIssue({
        kind: 'trello_webhook', jobId: null, operation: null, error: err instanceof Error ? err.message : String(err),
        summary: `Update “${FLAGS[flagKey].name}” from card ${a.data.card.name ?? a.data.card.id}`,
      })
      return NextResponse.json({ ok: true, failed: true })
    }
  }

  // A person moved a held "side stones" approval from Alterations to the same designer's Print Ready: sizes confirmed
  const before = parseDesignerList(a.data.listBefore?.name ?? ''), after = parseDesignerList(a.data.listAfter?.name ?? '')
  if (a.type === 'updateCard' && before?.stage === 'Alterations' && after?.stage === 'Print Ready'
      && before.designer.toLowerCase() === after.designer.toLowerCase()) {
    try {
      if (!(a.idMemberCreator && a.idMemberCreator === await getMyMemberId())) {
        const [job] = await db.select().from(jobs).where(eq(jobs.trelloCardId, a.data.card.id))
        if (job?.approvedHold === 'side_stones') await releaseHold(job, 'side_stones_confirmed')
      }
    } catch (err) {
      await recordIssue({
        kind: 'trello_webhook', jobId: null, operation: null, error: err instanceof Error ? err.message : String(err),
        summary: `Release the side stones approval for card ${a.data.card.name ?? a.data.card.id}`,
      })
    }
  }

  // A person moved a card into or out of REQUIRES SOURCING (the app's own moves are handled where they happen)
  if (a.type === 'updateCard' && (isSourcingList(a.data.listAfter?.name) || isSourcingList(a.data.listBefore?.name))) {
    try {
      if (a.idMemberCreator && a.idMemberCreator === await getMyMemberId()) return NextResponse.json({ ok: true, ignored: 'own move' })
      return NextResponse.json({ ok: true, result: await handleSourcingMove(a.data.card.id, a.data.listBefore?.name ?? '', a.data.listAfter?.name ?? '') })
    } catch (err) {
      await recordIssue({
        kind: 'trello_webhook', jobId: null, operation: null, error: err instanceof Error ? err.message : String(err),
        summary: `Handle a REQUIRES SOURCING move for card ${a.data.card.name ?? a.data.card.id}`,
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
      // Description edited: check the gemstone details for "ct TBC" (Stone not secured)
      if (descEdit) {
        const [job] = await db.select().from(jobs).where(eq(jobs.trelloCardId, a.data.card.id))
        const card = job ? await getCard(a.data.card.id) : null
        if (job && card) await detectStone(job, card).catch(err => recordIssue({
          kind: 'trello_webhook', jobId: job.id, operation: null, error: err instanceof Error ? err.message : String(err),
          summary: 'Check the gemstone details for “ct TBC”',
        }))
      }
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
