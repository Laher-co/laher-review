ALTER TABLE "jobs" ADD COLUMN "setting_choice" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "setting_choice_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "setting_choice_by" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "setting_not_needed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_setting_choice_by_staff_id_fk" FOREIGN KEY ("setting_choice_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
