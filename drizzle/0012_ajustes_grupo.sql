ALTER TABLE "leagues" ADD COLUMN "show_money" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "leagues" ADD COLUMN "show_raises" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Las ligas que ya había lo tenían encendido con ESPIA_DINERO / ESPIA_SUBIDAS
UPDATE "leagues" SET "show_money" = true, "show_raises" = true;
