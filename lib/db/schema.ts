import {
  pgTable, pgEnum, uuid, text, integer, timestamp, boolean, jsonb, uniqueIndex, index,
} from 'drizzle-orm/pg-core'

// ── Enums ─────────────────────────────────────────────────────────────────────

// designer: jobs and uploads · va: message queue · escalations: Rach · owner: Ryan
// ('admin' is legacy and unused; Postgres can't drop enum values)
export const staffRole        = pgEnum('staff_role', ['designer', 'va', 'admin', 'escalations', 'owner'])
export const issueKind        = pgEnum('issue_kind', [
  'trello_move', 'trello_comment', 'trello_attachment', 'trello_label', 'trello_fields',
  'email_send', 'email_bounce', 'webhook', 'trello_webhook',
])
export const issueStatus      = pgEnum('issue_status', ['open', 'resolved', 'ignored'])
export const jobStatus        = pgEnum('job_status', ['draft', 'in_review', 'changes_requested', 'approved', 'approved_size_needed', 'closed'])
export const ringSizeStatus   = pgEnum('ring_size_status', ['unconfirmed', 'submitted', 'confirmed'])
export const versionStatus    = pgEnum('version_status', ['draft', 'published'])
export const authorType       = pgEnum('author_type', ['customer', 'staff'])
export const decisionType     = pgEnum('decision_type', ['approved', 'changes_requested'])
export const waitingReason    = pgEnum('waiting_reason', ['message', 'decision', 'ring_size'])
export const emailStatus      = pgEnum('email_status', ['sent', 'skipped_do_not_email', 'failed'])
export const webhookStatus    = pgEnum('webhook_status', ['pending', 'sent', 'failed', 'skipped'])

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

// ── Staff ─────────────────────────────────────────────────────────────────────

export const staff = pgTable('staff', {
  id:        uuid('id').primaryKey().defaultRandom(),
  name:      text('name').notNull().unique(),
  role:      staffRole('role').notNull().default('designer'),
  email:     text('email'),
  // Designers on the new system: their new cards get an "Open in LAHER Studio" link
  onStudio:  boolean('on_studio').notNull().default(false),
  active:    boolean('active').notNull().default(true),
  createdAt: createdAt(),
})

// ── Jobs ──────────────────────────────────────────────────────────────────────

export const jobs = pgTable('jobs', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  // Unguessable code in the customer link: review.laher.co/r/{publicCode}
  publicCode:          text('public_code').notNull().unique(),
  trelloCardId:        text('trello_card_id').notNull().unique(),
  trelloShortUrl:      text('trello_short_url'),
  customerName:        text('customer_name').notNull(),
  customerEmail:       text('customer_email').notNull(),
  title:               text('title'),
  designerId:          uuid('designer_id').references(() => staff.id),
  status:              jobStatus('status').notNull().default('draft'),
  ringSize:            text('ring_size'),
  ringSizeStatus:      ringSizeStatus('ring_size_status').notNull().default('unconfirmed'),
  ringSizeSubmittedAt: timestamp('ring_size_submitted_at', { withTimezone: true }),
  ringSizeConfirmedBy: uuid('ring_size_confirmed_by').references(() => staff.id),
  ringSizeConfirmedAt: timestamp('ring_size_confirmed_at', { withTimezone: true }),
  createdBy:           uuid('created_by').references(() => staff.id),
  createdAt:           createdAt(),
  updatedAt:           timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// ── Versions, options, renders ────────────────────────────────────────────────

export const versions = pgTable('versions', {
  id:           uuid('id').primaryKey().defaultRandom(),
  jobId:        uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  number:       integer('number').notNull(),
  designerNote: text('designer_note'),
  status:       versionStatus('status').notNull().default('draft'),
  publishedAt:  timestamp('published_at', { withTimezone: true }),
  publishedBy:  uuid('published_by').references(() => staff.id),
  createdAt:    createdAt(),
}, t => [uniqueIndex('versions_job_number').on(t.jobId, t.number)])

export const options = pgTable('options', {
  id:        uuid('id').primaryKey().defaultRandom(),
  versionId: uuid('version_id').notNull().references(() => versions.id, { onDelete: 'cascade' }),
  label:     text('label').notNull(), // "A", "B", …
  sort:      integer('sort').notNull().default(0),
  createdAt: createdAt(),
}, t => [uniqueIndex('options_version_label').on(t.versionId, t.label)])

export const renders = pgTable('renders', {
  id:         uuid('id').primaryKey().defaultRandom(),
  optionId:   uuid('option_id').notNull().references(() => options.id, { onDelete: 'cascade' }),
  blobUrl:    text('blob_url').notNull(),
  blobPath:   text('blob_path').notNull(),
  width:      integer('width'),
  height:     integer('height'),
  sort:       integer('sort').notNull().default(0),
  uploadedBy: uuid('uploaded_by').references(() => staff.id),
  createdAt:  createdAt(),
}, t => [index('renders_option').on(t.optionId)])

// ── Conversation (Phase 2–3) ──────────────────────────────────────────────────

// Annotation entries keep the drawing image for people and the raw strokes
// for the AI agent that will later read feedback.
export type Annotation = {
  renderId:   string
  renderUrl:  string
  drawingUrl: string
  strokes?:   unknown
}

export const messages = pgTable('messages', {
  id:          uuid('id').primaryKey().defaultRandom(),
  jobId:       uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  versionId:   uuid('version_id').references(() => versions.id, { onDelete: 'set null' }), // null = general thread
  author:      authorType('author').notNull(),
  staffId:     uuid('staff_id').references(() => staff.id),
  body:        text('body').notNull(),
  annotations: jsonb('annotations').$type<Annotation[]>().notNull().default([]),
  // One per send, generated in the browser: a double-tap can't post twice
  clientKey:   text('client_key').unique(),
  createdAt:   createdAt(),
}, t => [index('messages_job').on(t.jobId, t.createdAt)])

export type ChangeRequest = { area: 'band' | 'setting' | 'stone' | 'metal' | 'other'; note: string }

export const decisions = pgTable('decisions', {
  id:          uuid('id').primaryKey().defaultRandom(),
  jobId:       uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  versionId:   uuid('version_id').notNull().references(() => versions.id),
  optionId:    uuid('option_id').references(() => options.id),
  decision:    decisionType('decision').notNull(),
  changes:     jsonb('changes').$type<ChangeRequest[]>().notNull().default([]),
  comments:    text('comments'),
  annotations: jsonb('annotations').$type<Annotation[]>().notNull().default([]),
  // Approved without a ring size: the card waits for staff to confirm one
  sizeOutstanding: boolean('size_outstanding').notNull().default(false),
  // Generated once per submission in the browser, so a double-tap or retry
  // can't record the same response twice
  clientKey:   text('client_key').unique(),
  createdAt:   createdAt(),
}, t => [index('decisions_job').on(t.jobId, t.createdAt)])

// One open row per job at most: the single queue and response timer
export const waiting = pgTable('waiting', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  jobId:              uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  reason:             waitingReason('reason').notNull(),
  waitingSince:       timestamp('waiting_since', { withTimezone: true }).notNull().defaultNow(),
  alertSentAt:        timestamp('alert_sent_at', { withTimezone: true }),
  overdueAlertSentAt: timestamp('overdue_alert_sent_at', { withTimezone: true }),
  answeredAt:         timestamp('answered_at', { withTimezone: true }),
  answeredBy:         uuid('answered_by').references(() => staff.id),
  workingMinutes:     integer('working_minutes'),
}, t => [index('waiting_open').on(t.jobId, t.answeredAt)])

// ── Delivery logs ─────────────────────────────────────────────────────────────

export const emails = pgTable('emails', {
  id:         uuid('id').primaryKey().defaultRandom(),
  jobId:      uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  to:         text('to').notNull(),
  type:       text('type').notNull(),
  status:     emailStatus('status').notNull(),
  providerId: text('provider_id'),
  error:      text('error'),
  createdAt:  createdAt(),
})

export const webhookEvents = pgTable('webhook_events', {
  id:        uuid('id').primaryKey().defaultRandom(),
  jobId:     uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  type:      text('type').notNull(),
  payload:   jsonb('payload').notNull(),
  status:    webhookStatus('status').notNull().default('pending'),
  attempts:  integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: createdAt(),
})

// "Who did what" — every staff and customer action on a job
export const events = pgTable('events', {
  id:        uuid('id').primaryKey().defaultRandom(),
  jobId:     uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
  staffId:   uuid('staff_id').references(() => staff.id),
  type:      text('type').notNull(),
  details:   jsonb('details').notNull().default({}),
  createdAt: createdAt(),
}, t => [index('events_job').on(t.jobId, t.createdAt)])

// ── Issues: anything that failed and needs a person ──────────────────────────

// What to run again when staff press Retry (see lib/issues.ts for the types)
export type IssueOperation = { type: string; args: Record<string, unknown> }

export const issues = pgTable('issues', {
  id:          uuid('id').primaryKey().defaultRandom(),
  jobId:       uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
  kind:        issueKind('kind').notNull(),
  summary:     text('summary').notNull(),            // e.g. "Move card to Heather | Print Ready"
  operation:   jsonb('operation').$type<IssueOperation | null>(),  // null = can't be retried automatically
  lastError:   text('last_error'),
  status:      issueStatus('status').notNull().default('open'),
  attempts:    integer('attempts').notNull().default(1),
  alertedAt:   timestamp('alerted_at', { withTimezone: true }),
  createdAt:   createdAt(),
  lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt:  timestamp('resolved_at', { withTimezone: true }),
  resolvedBy:  uuid('resolved_by').references(() => staff.id),
}, t => [index('issues_open').on(t.status, t.createdAt)])

// Small key/value store, e.g. when the daily digest last went out
export const kv = pgTable('kv', {
  key:       text('key').primaryKey(),
  value:     jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
