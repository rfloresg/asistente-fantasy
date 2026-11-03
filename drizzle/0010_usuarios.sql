CREATE TABLE "laliga_sessions" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"refresh_enc" text NOT NULL,
	"redirect" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"league_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"group_chat_id" text,
	"group_owner_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"state" text PRIMARY KEY NOT NULL,
	"verifier" text NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" integer NOT NULL,
	"league_id" text NOT NULL,
	"plan" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "memberships_user_id_league_id_pk" PRIMARY KEY("user_id","league_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"telegram_id" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "users_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
ALTER TABLE "espia_plans" ADD COLUMN "user_id" integer;