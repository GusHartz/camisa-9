CREATE TABLE "player"."decision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"athlete_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"ord" integer NOT NULL,
	"template_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"chosen_option" text,
	"outcome" jsonb,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decision_one_per_day" UNIQUE("athlete_id","day","template_id")
);
--> statement-breakpoint
ALTER TABLE "player"."decision" ADD CONSTRAINT "decision_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "player"."athlete"("id") ON DELETE no action ON UPDATE no action;