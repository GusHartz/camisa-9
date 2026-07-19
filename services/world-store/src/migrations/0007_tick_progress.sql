CREATE TABLE "tick_progress" (
	"world_seed" text PRIMARY KEY NOT NULL,
	"last_day_index" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tick_progress" ADD CONSTRAINT "tick_progress_world_seed_world_seed_fk" FOREIGN KEY ("world_seed") REFERENCES "public"."world"("seed") ON DELETE no action ON UPDATE no action;