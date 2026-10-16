ALTER TYPE "public"."issue_kind" ADD VALUE 'email_inbound';--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "plan" text DEFAULT 'first' NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "do_not_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "reply_token" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "source" text DEFAULT 'page' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "email_from" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_reply_token_unique" UNIQUE("reply_token");