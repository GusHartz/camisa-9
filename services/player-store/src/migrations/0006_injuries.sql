CREATE TABLE "player"."injury" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"severity" text NOT NULL,
	"started_day" integer NOT NULL,
	"recovery_days" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player"."injury" ADD CONSTRAINT "injury_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "player"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "injury_one_active_per_athlete" ON "player"."injury" USING btree ("athlete_id") WHERE "player"."injury"."status" = 'active';