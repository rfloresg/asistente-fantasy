CREATE TABLE "ingest_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean DEFAULT false NOT NULL,
	"players" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"week" integer NOT NULL,
	"date" timestamp with time zone NOT NULL,
	"local_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"state" integer NOT NULL,
	"local_score" integer,
	"visitor_score" integer
);
--> statement-breakpoint
CREATE TABLE "player_values" (
	"player_id" text NOT NULL,
	"day" date NOT NULL,
	"value" bigint NOT NULL,
	"bids" integer NOT NULL,
	CONSTRAINT "player_values_player_id_day_pk" PRIMARY KEY("player_id","day")
);
--> statement-breakpoint
CREATE TABLE "player_weeks" (
	"player_id" text NOT NULL,
	"week" integer NOT NULL,
	"points" integer NOT NULL,
	"minutes" integer NOT NULL,
	"ideal" boolean NOT NULL,
	"stats" jsonb NOT NULL,
	CONSTRAINT "player_weeks_player_id_week_pk" PRIMARY KEY("player_id","week")
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" text PRIMARY KEY NOT NULL,
	"nickname" text NOT NULL,
	"team_id" text,
	"position_id" integer NOT NULL,
	"status" text NOT NULL,
	"market_value" bigint NOT NULL,
	"points" integer NOT NULL,
	"average_points" real NOT NULL,
	"last_season_points" integer,
	"image_url" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text,
	"slug" text,
	"badge_url" text
);
