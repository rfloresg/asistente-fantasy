CREATE TABLE "espia_done" (
	"league_id" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "espia_done_league_id_key_pk" PRIMARY KEY("league_id","key")
);
