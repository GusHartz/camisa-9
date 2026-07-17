CREATE TABLE "legend" (
	"world_seed" text NOT NULL,
	"human_athlete_id" uuid NOT NULL,
	"season_ended" text NOT NULL,
	"human_name" text NOT NULL,
	"club_id" text NOT NULL,
	"position" text NOT NULL,
	"ability" integer NOT NULL,
	"age" integer NOT NULL,
	"legacy_points" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "legend_world_seed_human_athlete_id_season_ended_pk" PRIMARY KEY("world_seed","human_athlete_id","season_ended")
);
--> statement-breakpoint
ALTER TABLE "world_occupation" ADD COLUMN "regen_requested" boolean DEFAULT false NOT NULL;