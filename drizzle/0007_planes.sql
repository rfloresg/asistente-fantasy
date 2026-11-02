CREATE TABLE "espia_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"league_id" text NOT NULL,
	"league_name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"score_day" date,
	"my_money" bigint NOT NULL,
	"acciones" jsonb NOT NULL
);
