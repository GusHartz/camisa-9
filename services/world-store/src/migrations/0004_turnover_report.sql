CREATE TABLE "turnover_report" (
	"world_seed" text NOT NULL,
	"from_season_id" text NOT NULL,
	"to_season_id" text NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "turnover_report_world_seed_from_season_id_pk" PRIMARY KEY("world_seed","from_season_id")
);
