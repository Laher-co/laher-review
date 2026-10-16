CREATE TYPE "public"."followup_kind" AS ENUM('design', 'size');--> statement-breakpoint
CREATE TYPE "public"."followup_status" AS ENUM('active', 'requires_call', 'follow_up', 'stopped', 'done');--> statement-breakpoint
CREATE TABLE "followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" "followup_kind" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"automated" boolean DEFAULT false NOT NULL,
	"reminders_sent" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp with time zone,
	"status" "followup_status" DEFAULT 'active' NOT NULL,
	"flagged_at" timestamp with time zone,
	"stopped_reason" text,
	"closed_at" timestamp with time zone,
	"closed_by" uuid,
	"close_note" text
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "auto_sequence_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "size_sequence_used" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_closed_by_staff_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "followups_open" ON "followups" USING btree ("status","started_at");