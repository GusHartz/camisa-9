CREATE TABLE "athlete" (
	"world_seed" text NOT NULL,
	"club_id" text NOT NULL,
	"id" text NOT NULL,
	"ord" integer NOT NULL,
	"name" text NOT NULL,
	"age" integer NOT NULL,
	"ability" integer NOT NULL,
	"position" text NOT NULL,
	CONSTRAINT "athlete_world_seed_id_pk" PRIMARY KEY("world_seed","id")
);
--> statement-breakpoint
CREATE TABLE "club" (
	"world_seed" text NOT NULL,
	"league_id" text NOT NULL,
	"id" text NOT NULL,
	"ord" integer NOT NULL,
	"name" text NOT NULL,
	"archetype" text NOT NULL,
	"weights" jsonb NOT NULL,
	CONSTRAINT "club_world_seed_id_pk" PRIMARY KEY("world_seed","id")
);
--> statement-breakpoint
CREATE TABLE "league" (
	"world_seed" text NOT NULL,
	"tier" integer NOT NULL,
	"league_id" text NOT NULL,
	"ord" integer NOT NULL,
	CONSTRAINT "league_world_seed_league_id_pk" PRIMARY KEY("world_seed","league_id")
);
--> statement-breakpoint
CREATE TABLE "world" (
	"seed" text PRIMARY KEY NOT NULL,
	"season_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_tier" (
	"world_seed" text NOT NULL,
	"tier" integer NOT NULL,
	CONSTRAINT "world_tier_world_seed_tier_pk" PRIMARY KEY("world_seed","tier")
);
--> statement-breakpoint
ALTER TABLE "athlete" ADD CONSTRAINT "athlete_world_seed_club_id_club_world_seed_id_fk" FOREIGN KEY ("world_seed","club_id") REFERENCES "public"."club"("world_seed","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club" ADD CONSTRAINT "club_world_seed_league_id_league_world_seed_league_id_fk" FOREIGN KEY ("world_seed","league_id") REFERENCES "public"."league"("world_seed","league_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league" ADD CONSTRAINT "league_world_seed_tier_world_tier_world_seed_tier_fk" FOREIGN KEY ("world_seed","tier") REFERENCES "public"."world_tier"("world_seed","tier") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_tier" ADD CONSTRAINT "world_tier_world_seed_world_seed_fk" FOREIGN KEY ("world_seed") REFERENCES "public"."world"("seed") ON DELETE no action ON UPDATE no action;