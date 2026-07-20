CREATE TABLE "waiting_list" (
	"world_seed" text NOT NULL,
	"human_athlete_id" text NOT NULL,
	"position" text NOT NULL,
	"ord" integer NOT NULL,
	CONSTRAINT "waiting_list_world_seed_human_athlete_id_pk" PRIMARY KEY("world_seed","human_athlete_id")
);
--> statement-breakpoint
ALTER TABLE "waiting_list" ADD CONSTRAINT "waiting_list_world_seed_world_seed_fk" FOREIGN KEY ("world_seed") REFERENCES "public"."world"("seed") ON DELETE no action ON UPDATE no action;