CREATE TABLE "chat_usage" (
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "chat_usage_user_id_day_pk" PRIMARY KEY("user_id","day")
);
