CREATE TABLE "player"."purchase" (
	"athlete_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_athlete_id_item_id_pk" PRIMARY KEY("athlete_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD COLUMN "balance" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player"."purchase" ADD CONSTRAINT "purchase_athlete_id_athlete_id_fk" FOREIGN KEY ("athlete_id") REFERENCES "player"."athlete"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD CONSTRAINT "athlete_balance_range" CHECK ("player"."athlete"."balance" >= 0);