CREATE TYPE "public"."issue_kind" AS ENUM('trello_move', 'trello_comment', 'trello_attachment', 'trello_label', 'trello_fields', 'email_send', 'email_bounce', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'resolved', 'ignored');--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'escalations';--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE 'owner';--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid,
	"kind" "issue_kind" NOT NULL,
	"summary" text NOT NULL,
	"operation" jsonb,
	"last_error" text,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"alerted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "kv" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_resolved_by_staff_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_open" ON "issues" USING btree ("status","created_at");