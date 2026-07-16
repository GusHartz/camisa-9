ALTER TABLE "player"."athlete" ADD COLUMN "last_focus" text;--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD COLUMN "focus_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD CONSTRAINT "athlete_focus_streak_range" CHECK ("player"."athlete"."focus_streak" >= 0);