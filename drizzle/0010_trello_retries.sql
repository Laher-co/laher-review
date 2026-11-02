ALTER TYPE "public"."issue_status" ADD VALUE 'retrying';--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "resolution_note" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "auto_retries" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "next_retry_at" timestamp with time zone;