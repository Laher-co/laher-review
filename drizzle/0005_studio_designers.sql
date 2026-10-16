ALTER TYPE "public"."issue_kind" ADD VALUE 'trello_webhook';--> statement-breakpoint
ALTER TABLE "staff" ADD COLUMN "on_studio" boolean DEFAULT false NOT NULL;