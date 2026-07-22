CREATE TABLE "player"."season_summary" (
	"athlete_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"season_id" text NOT NULL,
	"club_id" text NOT NULL,
	"club_name" text NOT NULL,
	"league_id" text NOT NULL,
	"tier" integer NOT NULL,
	"position" text NOT NULL,
	"matches" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"rating_sum" integer DEFAULT 0 NOT NULL,
	"rating_best" integer,
	"rating_best_round" integer,
	"rating_first" integer,
	"rating_last" integer,
	"first_round" integer,
	"last_round" integer,
	"start_overall" integer NOT NULL,
	"end_overall" integer NOT NULL,
	"outcome" text,
	"tier_after" integer,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "season_summary_pk" PRIMARY KEY("athlete_id","season_id"),
	CONSTRAINT "season_summary_outcome_valid" CHECK ("player"."season_summary"."outcome" is null or "player"."season_summary"."outcome" in ('champion', 'promoted', 'stayed', 'relegated')),
	CONSTRAINT "season_summary_counts_range" CHECK ("player"."season_summary"."matches" >= 0 and "player"."season_summary"."goals" >= 0 and "player"."season_summary"."assists" >= 0 and "player"."season_summary"."rating_sum" >= 0)
);
--> statement-breakpoint
ALTER TABLE "player"."season_summary" ADD CONSTRAINT "season_summary_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "player"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player"."season_summary" ADD CONSTRAINT "season_summary_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "player"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_summary_open_idx" ON "player"."season_summary" USING btree ("season_id") WHERE "player"."season_summary"."closed_at" is null;--> statement-breakpoint
CREATE INDEX "season_summary_account_idx" ON "player"."season_summary" USING btree ("account_id","closed_at") WHERE "player"."season_summary"."closed_at" is not null;