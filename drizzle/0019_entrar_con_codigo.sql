CREATE TABLE "login_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"telegram_id" text,
	"name" text,
	"used_at" timestamp with time zone
);
