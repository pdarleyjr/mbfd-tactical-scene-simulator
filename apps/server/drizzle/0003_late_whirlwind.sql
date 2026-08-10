ALTER TABLE "scenarios" ADD COLUMN "archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD COLUMN "accumulated_elapsed_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD COLUMN "timer_anchor_at" timestamp with time zone;--> statement-breakpoint
UPDATE "training_sessions"
SET "timer_anchor_at" = COALESCE("started_at", "updated_at", "created_at")
WHERE "status" = 'running';--> statement-breakpoint
UPDATE "training_sessions"
SET "accumulated_elapsed_ms" = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM ("updated_at" - COALESCE("started_at", "created_at"))) * 1000)::integer)
WHERE "status" IN ('frozen', 'complete') AND "started_at" IS NOT NULL;--> statement-breakpoint
UPDATE "scenarios"
SET "benchmarks" = '[{"id":"command-established","label":"Command established","description":"The incident command function is announced and operating."},{"id":"initial-size-up","label":"Initial size-up complete","description":"The first-arriving unit communicates conditions, actions, and needs."},{"id":"water-supply-established","label":"Water supply established","description":"A sustained water supply is connected and available."},{"id":"initial-attack-line","label":"Initial attack line in service","description":"The initial attack line is deployed, charged, and operating."},{"id":"primary-search-complete","label":"Primary search complete","description":"Primary search results are reported to command."}]'::jsonb,
    "updated_at" = NOW()
WHERE "benchmarks" = '[]'::jsonb;
