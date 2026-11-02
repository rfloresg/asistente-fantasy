CREATE TABLE "espia_clauses" (
	"league_id" text NOT NULL,
	"player_id" text NOT NULL,
	"team_id" text NOT NULL,
	"clause" bigint NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "espia_clauses_league_id_player_id_pk" PRIMARY KEY("league_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "espia_raises" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"team_id" text NOT NULL,
	"player_id" text NOT NULL,
	"increase" bigint NOT NULL,
	"cost" bigint NOT NULL,
	"at" timestamp with time zone NOT NULL
);
