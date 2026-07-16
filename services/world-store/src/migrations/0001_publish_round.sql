CREATE TABLE "published_round" (
	"league_id" text NOT NULL,
	"season_id" text NOT NULL,
	"round" integer NOT NULL,
	"result" jsonb NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "published_round_league_id_season_id_round_pk" PRIMARY KEY("league_id","season_id","round")
);
