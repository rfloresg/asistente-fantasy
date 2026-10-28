CREATE TABLE "espia_events" (
	"league_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "espia_events_league_id_activity_id_pk" PRIMARY KEY("league_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "espia_state" (
	"league_id" text PRIMARY KEY NOT NULL,
	"last_summary_day" date
);
