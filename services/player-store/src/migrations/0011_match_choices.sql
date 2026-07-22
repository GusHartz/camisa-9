CREATE TABLE "player"."match_choice" (
	"athlete_id" uuid NOT NULL,
	"season_id" text NOT NULL,
	"round" integer NOT NULL,
	"template_id" text NOT NULL,
	"chosen_option" text NOT NULL,
	"result" text NOT NULL,
	"effect" jsonb NOT NULL,
	"resolved_by" text NOT NULL,
	"day" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_choice_pk" PRIMARY KEY("athlete_id","season_id","round","template_id")
);
--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD COLUMN "next_train_focus" text;--> statement-breakpoint
ALTER TABLE "player"."match_choice" ADD CONSTRAINT "match_choice_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "player"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD CONSTRAINT "athlete_next_train_focus_valid" CHECK ("player"."athlete"."next_train_focus" is null or "player"."athlete"."next_train_focus" in ('fisico', 'tecnico', 'tatico', 'mental'));