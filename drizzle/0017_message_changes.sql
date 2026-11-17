ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "card_list" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "intent" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "change_request_id" uuid;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "from_message_id" uuid;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "marked_by" uuid;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "decisions" ADD COLUMN IF NOT EXISTS "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_change_request_id_decisions_id_fk" FOREIGN KEY ("change_request_id") REFERENCES "public"."decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_marked_by_staff_id_fk" FOREIGN KEY ("marked_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_voided_by_staff_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
