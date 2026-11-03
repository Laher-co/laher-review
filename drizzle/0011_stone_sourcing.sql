ALTER TABLE "jobs" ADD COLUMN "stone_not_secured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "stone_details_seen" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "sourcing" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "sourcing_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "sourcing_designer" text;