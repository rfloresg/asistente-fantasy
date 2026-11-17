CREATE TABLE "waitlist" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"invited_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;