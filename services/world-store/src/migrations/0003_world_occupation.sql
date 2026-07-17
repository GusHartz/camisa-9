CREATE TABLE "world_occupation" (
	"world_seed" text NOT NULL,
	"athlete_id" text NOT NULL,
	"human_athlete_id" uuid NOT NULL,
	"season_id" text NOT NULL,
	"club_id" text NOT NULL,
	"position" text NOT NULL,
	"human_name" text NOT NULL,
	"ability" integer NOT NULL,
	"occupied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_occupation_world_seed_athlete_id_pk" PRIMARY KEY("world_seed","athlete_id")
);
--> statement-breakpoint
ALTER TABLE "athlete" ADD COLUMN "is_human" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "world_occupation" ADD CONSTRAINT "world_occupation_world_seed_athlete_id_athlete_world_seed_id_fk" FOREIGN KEY ("world_seed","athlete_id") REFERENCES "public"."athlete"("world_seed","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "occupation_one_slot_per_human" ON "world_occupation" USING btree ("world_seed","human_athlete_id");