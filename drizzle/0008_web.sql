ALTER TABLE "espia_plans" ADD COLUMN "close_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "espia_plans" ADD COLUMN "lineup" jsonb;--> statement-breakpoint
ALTER TABLE "espia_plans" ADD COLUMN "liga" jsonb;