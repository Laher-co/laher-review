ALTER TABLE "messages" ADD COLUMN "client_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_client_key_unique" UNIQUE("client_key");