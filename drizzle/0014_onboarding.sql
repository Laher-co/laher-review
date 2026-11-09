ALTER TABLE "jobs" ADD COLUMN "onboarding_link_posted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "setting_question" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "irregular_cluster_auto" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "irregular_cluster_override" boolean;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cluster_styles" text[];--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cluster_saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ring_size_not_sure_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"question" text NOT NULL,
	"answer" text,
	"answered_at" timestamp with time zone,
	"asked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onboarding_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "onboarding_questions" ADD CONSTRAINT "onboarding_questions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_questions" ADD CONSTRAINT "onboarding_questions_asked_by_staff_id_fk" FOREIGN KEY ("asked_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_notes" ADD CONSTRAINT "onboarding_notes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_questions_job" ON "onboarding_questions" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onboarding_notes_job" ON "onboarding_notes" USING btree ("job_id","created_at");
