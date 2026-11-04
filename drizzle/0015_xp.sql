ALTER TABLE "player_scores" ADD COLUMN "xp" real;--> statement-breakpoint
ALTER TABLE "player_scores" ADD COLUMN "xp_next" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "player_scores" ADD COLUMN "p_start" real;