ALTER TABLE "player"."athlete" ADD COLUMN "forma" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD COLUMN "moral" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD CONSTRAINT "athlete_forma_range" CHECK ("player"."athlete"."forma" between 0 and 100);--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD CONSTRAINT "athlete_moral_range" CHECK ("player"."athlete"."moral" between 0 and 100);