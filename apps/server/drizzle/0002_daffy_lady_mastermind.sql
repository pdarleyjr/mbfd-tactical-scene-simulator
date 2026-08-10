ALTER TABLE "scenarios" ADD COLUMN "benchmarks" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE TABLE "training_rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"access_pin_hash" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "training_rooms" ("id", "name", "created_at", "updated_at")
SELECT "training_sessions"."id", "scenarios"."title" || ' — ' || to_char("training_sessions"."created_at" AT TIME ZONE 'America/New_York', 'YYYY-MM-DD HH24:MI'), "training_sessions"."created_at", "training_sessions"."updated_at"
FROM "training_sessions"
JOIN "scenarios" ON "scenarios"."id" = "training_sessions"."scenario_id";
--> statement-breakpoint
ALTER TABLE "training_sessions" ADD COLUMN "room_id" uuid;
--> statement-breakpoint
UPDATE "training_sessions" SET "room_id" = "id";
--> statement-breakpoint
ALTER TABLE "training_sessions" ALTER COLUMN "room_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_room_id_training_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."training_rooms"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "session_units" (
	"session_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"status" text DEFAULT 'staged' NOT NULL,
	"arrived_at" timestamp with time zone,
	"arrived_by_client_id" text
);
--> statement-breakpoint
INSERT INTO "session_units" ("session_id", "unit")
SELECT "training_sessions"."id", value
FROM "training_sessions", jsonb_array_elements_text("training_sessions"."participating_units") AS value;
--> statement-breakpoint
CREATE TABLE "evolution_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"evolution_id" text NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"started_elapsed_ms" integer NOT NULL,
	"started_by_client_id" text NOT NULL,
	"started_by_name" text NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_elapsed_ms" integer,
	"completed_by_client_id" text
);
--> statement-breakpoint
CREATE TABLE "session_benchmarks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"source_benchmark_id" text NOT NULL,
	"label" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_elapsed_ms" integer,
	"completed_by_client_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "session_units" ADD CONSTRAINT "session_units_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "evolution_runs" ADD CONSTRAINT "evolution_runs_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "session_benchmarks" ADD CONSTRAINT "session_benchmarks_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "training_rooms_updated_idx" ON "training_rooms" USING btree ("updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "session_unit_unique" ON "session_units" USING btree ("session_id", "unit");
--> statement-breakpoint
CREATE INDEX "session_units_status_idx" ON "session_units" USING btree ("session_id", "status");
--> statement-breakpoint
CREATE INDEX "evolution_runs_session_unit_idx" ON "evolution_runs" USING btree ("session_id", "unit", "started_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "session_benchmark_source_unique" ON "session_benchmarks" USING btree ("session_id", "source_benchmark_id");
--> statement-breakpoint
CREATE INDEX "session_benchmarks_completion_idx" ON "session_benchmarks" USING btree ("session_id", "completed_at");
--> statement-breakpoint
CREATE INDEX "training_sessions_room_idx" ON "training_sessions" USING btree ("room_id", "created_at");
