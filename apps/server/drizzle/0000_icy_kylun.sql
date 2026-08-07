CREATE TABLE "apparatus_capabilities" (
	"apparatus_template_id" text NOT NULL,
	"capability" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apparatus_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"designation" text NOT NULL,
	"kind" text NOT NULL,
	"asset_path" text NOT NULL,
	"real_length_ft" real,
	"real_width_ft" real,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appliance_types" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evolution_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"summary" text NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evolution_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"evolution_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"configuration" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercise_results" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hose_types" (
	"id" text PRIMARY KEY NOT NULL,
	"inside_diameter_in" real NOT NULL,
	"coupling" text NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nozzle_types" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"coupling" text NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scenario_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"original_path" text NOT NULL,
	"runtime_path" text NOT NULL,
	"thumbnail_path" text,
	"poster_path" text,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenario_injects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"scenario_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"reveal_at_seconds" integer,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"dispatch_information" text DEFAULT '' NOT NULL,
	"world_width" real NOT NULL,
	"world_height" real NOT NULL,
	"feet_per_world_unit" real,
	"apparatus_template_ids" jsonb NOT NULL,
	"evolution_ids" jsonb NOT NULL,
	"injects" jsonb NOT NULL,
	"background_asset_id" uuid,
	"video_asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenarios_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"workspace" text NOT NULL,
	"elapsed_ms" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"actor_client_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_unit" text NOT NULL,
	"event_type" text NOT NULL,
	"object_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"client_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"scenario_id" uuid NOT NULL,
	"participating_units" jsonb NOT NULL,
	"mode_300" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone,
	"frozen_300_plan" "bytea",
	"presentation_mode" text DEFAULT 'operations' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_sessions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "workspace_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"workspace" text NOT NULL,
	"reason" text NOT NULL,
	"state" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yjs_documents" (
	"name" text PRIMARY KEY NOT NULL,
	"state" "bytea" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "apparatus_capabilities" ADD CONSTRAINT "apparatus_capabilities_apparatus_template_id_apparatus_templates_id_fk" FOREIGN KEY ("apparatus_template_id") REFERENCES "public"."apparatus_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evolution_stages" ADD CONSTRAINT "evolution_stages_evolution_id_evolution_definitions_id_fk" FOREIGN KEY ("evolution_id") REFERENCES "public"."evolution_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercise_results" ADD CONSTRAINT "exercise_results_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_assets" ADD CONSTRAINT "scenario_assets_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_injects" ADD CONSTRAINT "scenario_injects_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_session_id_training_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apparatus_capability_unique" ON "apparatus_capabilities" USING btree ("apparatus_template_id","capability");--> statement-breakpoint
CREATE UNIQUE INDEX "evolution_stage_unique" ON "evolution_stages" USING btree ("evolution_id","ordinal");--> statement-breakpoint
CREATE INDEX "scenario_assets_scenario_idx" ON "scenario_assets" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "scenarios_updated_idx" ON "scenarios" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "session_events_timeline_idx" ON "session_events" USING btree ("session_id","elapsed_ms");--> statement-breakpoint
CREATE UNIQUE INDEX "session_participant_client_unique" ON "session_participants" USING btree ("session_id","client_id");--> statement-breakpoint
CREATE INDEX "session_participant_unit_idx" ON "session_participants" USING btree ("session_id","unit");--> statement-breakpoint
CREATE INDEX "training_sessions_scenario_idx" ON "training_sessions" USING btree ("scenario_id");