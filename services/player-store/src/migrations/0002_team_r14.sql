CREATE TABLE "player"."team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kit" jsonb NOT NULL,
	"code" text NOT NULL,
	"captain_account_id" uuid NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "player"."team" ADD CONSTRAINT "team_captain_account_id_account_id_fk" FOREIGN KEY ("captain_account_id") REFERENCES "player"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD CONSTRAINT "athlete_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "player"."team"("id") ON DELETE no action ON UPDATE no action;