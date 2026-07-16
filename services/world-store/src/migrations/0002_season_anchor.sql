CREATE TABLE "season" (
	"world_seed" text NOT NULL,
	"season_id" text NOT NULL,
	"start_day_index" integer NOT NULL,
	CONSTRAINT "season_world_seed_season_id_pk" PRIMARY KEY("world_seed","season_id")
);
--> statement-breakpoint
ALTER TABLE "season" ADD CONSTRAINT "season_world_seed_world_seed_fk" FOREIGN KEY ("world_seed") REFERENCES "public"."world"("seed") ON DELETE no action ON UPDATE no action;