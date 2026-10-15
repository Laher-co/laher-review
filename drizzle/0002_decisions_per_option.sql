ALTER TYPE "public"."job_status" ADD VALUE 'approved_size_needed' BEFORE 'closed';--> statement-breakpoint
DROP INDEX "decisions_version";--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "size_outstanding" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN "client_key" text;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_client_key_unique" UNIQUE("client_key");