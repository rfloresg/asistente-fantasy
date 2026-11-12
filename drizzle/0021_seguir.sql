CREATE TABLE "watchlist" (
	"user_id" integer NOT NULL,
	"player_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "watchlist_user_id_player_id_pk" PRIMARY KEY("user_id","player_id")
);
--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;