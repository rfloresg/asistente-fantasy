CREATE TABLE "lineups" (
	"player_id" text NOT NULL,
	"day" date NOT NULL,
	"ff_id" text NOT NULL,
	"starter" boolean NOT NULL,
	"prob" integer,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "lineups_player_id_day_pk" PRIMARY KEY("player_id","day")
);
--> statement-breakpoint
ALTER TABLE "player_scores" ADD COLUMN "start_prob" integer;