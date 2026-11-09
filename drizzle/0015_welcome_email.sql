ALTER TABLE "jobs" ADD COLUMN "welcome_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "welcome_email_sent_by" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "onboarding_question_added_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "question_email_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "question_email_sent_by" uuid;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_welcome_email_sent_by_staff_id_fk" FOREIGN KEY ("welcome_email_sent_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_question_email_sent_by_staff_id_fk" FOREIGN KEY ("question_email_sent_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;
