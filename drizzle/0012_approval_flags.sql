ALTER TABLE "decisions" ADD COLUMN "concept" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "side_stones_unconfirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "concept_render" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "approved_hold" text;--> statement-breakpoint
ALTER TABLE "versions" ADD COLUMN "concept" boolean;