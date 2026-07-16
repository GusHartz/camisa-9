CREATE SCHEMA "player";
--> statement-breakpoint
CREATE TABLE "player"."account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "player"."athlete" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" text NOT NULL,
	"appearance" jsonb NOT NULL,
	"fisico" integer NOT NULL,
	"tecnico" integer NOT NULL,
	"tatico" integer NOT NULL,
	"mental" integer NOT NULL,
	"training_xp" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "athlete_fisico_range" CHECK ("player"."athlete"."fisico" between 0 and 99),
	CONSTRAINT "athlete_tecnico_range" CHECK ("player"."athlete"."tecnico" between 0 and 99),
	CONSTRAINT "athlete_tatico_range" CHECK ("player"."athlete"."tatico" between 0 and 99),
	CONSTRAINT "athlete_mental_range" CHECK ("player"."athlete"."mental" between 0 and 99)
);
--> statement-breakpoint
ALTER TABLE "player"."athlete" ADD CONSTRAINT "athlete_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "player"."account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "athlete_one_active_per_account" ON "player"."athlete" USING btree ("account_id") WHERE "player"."athlete"."active";