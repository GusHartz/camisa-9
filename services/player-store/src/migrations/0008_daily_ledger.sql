CREATE TABLE "player"."daily_ledger" (
	"athlete_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"scope" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_ledger_athlete_id_day_scope_pk" PRIMARY KEY("athlete_id","day","scope")
);
--> statement-breakpoint
ALTER TABLE "player"."daily_ledger" ADD CONSTRAINT "daily_ledger_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "player"."athlete"("id") ON DELETE no action ON UPDATE no action;