import 'server-only'
import { and, eq, isNull } from 'drizzle-orm'
import { db, issues, jobs, webhookEvents, type IssueOperation } from './db'
import { escapeHtml, sendEmail, staffEmailHtml, staffEmails } from './email'
import { siteOrigin } from './jobs'
import {
  addComment, attachUrl, ensureLabel, getCard, moveCardToStage, removeLabel, writeRingSizeFields,
} from './trello'
import type { Stage } from './trello-parse'

type Kind = typeof issues.$inferInsert['kind']

// ── Retryable operations ──────────────────────────────────────────────────────
// Every outside action the app takes is one of these, so a failure can be
// stored with exactly what to run again when staff press Retry.

async function card(cardId: string) {
  const c = await getCard(cardId)
  if (!c) throw new Error('Trello card not found')
  return c
}

const OPERATIONS: Record<string, (a: Record<string, unknown>) => Promise<unknown>> = {
  /** Move to the same designer's list for this stage; "not moved" counts as a failure. */
  'trello.move': async a => {
    const r = await moveCardToStage(String(a.cardId), a.stage as Stage)
    if (!r.moved) throw new Error(r.reason)
    return r
  },
  /** Publishing: the "Review App" label must be on before the move (old Zap filter). */
  'trello.labelAndMove': async a => {
    await ensureLabel(await card(String(a.cardId)), String(a.label))
    return OPERATIONS['trello.move'](a)
  },
  'trello.comment':     async a => addComment(String(a.cardId), String(a.text)),
  'trello.attach':      async a => attachUrl(String(a.cardId), String(a.url), String(a.name)),
  'trello.removeLabel': async a => removeLabel(await card(String(a.cardId)), String(a.name)),
  'trello.ringFields':  async a => writeRingSizeFields(
    await card(String(a.cardId)), (a.size as string | null) ?? null, a.status as 'Unconfirmed' | 'Customer submitted' | 'Confirmed'),
  /** Re-send a stored v2 webhook payload to Zapier. */
  'webhook.send': async a => {
    const url = process.env.ZAPIER_EVENTS_WEBHOOK_URL
    if (!url) throw new Error('ZAPIER_EVENTS_WEBHOOK_URL is not set')
    const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.id, String(a.webhookEventId)))
    if (!row) throw new Error('Webhook event not found')
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row.payload), cache: 'no-store',
    })
    const ok = res.ok
    await db.update(webhookEvents)
      .set({ status: ok ? 'sent' : 'failed', attempts: row.attempts + 1, lastError: ok ? null : `HTTP ${res.status}` })
      .where(eq(webhookEvents.id, row.id))
    if (!ok) throw new Error(`Zapier responded with HTTP ${res.status}`)
  },
  'email.send': async a => sendEmail(a as unknown as Parameters<typeof sendEmail>[0]),
}

async function runOperation(op: IssueOperation) {
  const fn = OPERATIONS[op.type]
  if (!fn) throw new Error(`Unknown operation ${op.type}`)
  return fn(op.args)
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 1000)

// ── Tracking ──────────────────────────────────────────────────────────────────

export type Tracked<T> = { ok: true; value: T } | { ok: false; error: string; issueId: string }

/**
 * Runs an outside action. If it fails, an issue is recorded (with what to
 * retry) and an alert email goes out straight away — nothing fails silently.
 * Never throws, so one failure doesn't stop the rest of a customer's request.
 */
export async function tracked<T = unknown>(kind: Kind, jobId: string | null, summary: string, op: IssueOperation): Promise<Tracked<T>> {
  try {
    return { ok: true, value: await runOperation(op) as T }
  } catch (err) {
    const issueId = await recordIssue({ kind, jobId, summary, operation: op, error: message(err) })
    return { ok: false, error: message(err), issueId }
  }
}

/** Records a failure (also used directly, e.g. for email bounces) and alerts. */
export async function recordIssue(i: { kind: Kind; jobId: string | null; summary: string; operation: IssueOperation | null; error: string }) {
  const [row] = await db.insert(issues).values({
    kind: i.kind, jobId: i.jobId, summary: i.summary, operation: i.operation, lastError: i.error,
  }).returning()
  console.error(`[issue] ${i.kind}: ${i.summary} — ${i.error}`)
  await alertIssue(row.id)
  return row.id
}

/** Emails the owner about one issue. A failed alert stays visible in the panel and the digest. */
async function alertIssue(issueId: string) {
  const [row] = await db.select({ issue: issues, customerName: jobs.customerName })
    .from(issues).leftJoin(jobs, eq(jobs.id, issues.jobId)).where(eq(issues.id, issueId))
  if (!row || row.issue.kind === 'email_send' && row.issue.operation?.args?.type === 'issue_alert') return
  try {
    const to = await staffEmails(['owner'])
    const job = row.customerName ? ` (${row.customerName})` : ''
    await sendEmail({
      to, type: 'issue_alert', jobId: row.issue.jobId,
      subject: `Review app problem: ${row.issue.summary}${job}`,
      text: `${row.issue.summary}${job}\n\nError: ${row.issue.lastError}\n\nRetry it from the Issues panel: ${siteOrigin()}/studio/issues`,
      html: staffEmailHtml('Something didn’t go through',
        `<p><strong>${escapeHtml(row.issue.summary)}</strong>${escapeHtml(job)}</p>
         <p style="color:#8C7B6E">Error: ${escapeHtml(row.issue.lastError ?? '')}</p>
         <p>You can retry it from the Issues panel.</p>`,
        { href: `${siteOrigin()}/studio/issues`, label: 'Open Issues' }),
    })
    await db.update(issues).set({ alertedAt: new Date() }).where(eq(issues.id, issueId))
  } catch (err) {
    // Don't recurse: the issue itself is already recorded and will be in the digest
    await db.update(issues).set({ lastError: `${row.issue.lastError} · Alert email failed: ${message(err)}` })
      .where(and(eq(issues.id, issueId), isNull(issues.alertedAt)))
  }
}

/** Runs a failed operation again. Resolves the issue if it works. */
export async function retryIssue(issueId: string, staffId: string) {
  const [row] = await db.select().from(issues).where(eq(issues.id, issueId))
  if (!row) throw new Error('Issue not found.')
  if (!row.operation) throw new Error('This one can’t be retried automatically. Fix it by hand, then mark it resolved.')
  try {
    await runOperation(row.operation)
    await db.update(issues).set({
      status: 'resolved', resolvedAt: new Date(), resolvedBy: staffId,
      attempts: row.attempts + 1, lastAttemptAt: new Date(),
    }).where(eq(issues.id, issueId))
    return { ok: true as const }
  } catch (err) {
    await db.update(issues).set({ attempts: row.attempts + 1, lastAttemptAt: new Date(), lastError: message(err) })
      .where(eq(issues.id, issueId))
    return { ok: false as const, error: message(err) }
  }
}

export async function setIssueStatus(issueId: string, status: 'resolved' | 'ignored' | 'open', staffId: string) {
  await db.update(issues).set({
    status,
    resolvedAt: status === 'open' ? null : new Date(),
    resolvedBy: status === 'open' ? null : staffId,
  }).where(eq(issues.id, issueId))
}

/** A tracked move as the { moved, to / reason } shape the event log and Studio use. */
export function moveOutcome(t: Tracked<unknown>) {
  return t.ok
    ? t.value as { moved: true; from: string; to: string }
    : { moved: false as const, reason: t.error, currentList: '', issueId: t.issueId }
}
