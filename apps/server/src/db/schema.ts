import { customType, index, integer, jsonb, pgTable, real, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import type { ScenarioInput } from '@mbfd/domain'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() { return 'bytea' },
})

export const scenarios = pgTable('scenarios', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  dispatchInformation: text('dispatch_information').notNull().default(''),
  worldWidth: real('world_width').notNull(),
  worldHeight: real('world_height').notNull(),
  feetPerWorldUnit: real('feet_per_world_unit'),
  apparatusTemplateIds: jsonb('apparatus_template_ids').$type<string[]>().notNull(),
  evolutionIds: jsonb('evolution_ids').$type<string[]>().notNull(),
  injects: jsonb('injects').$type<Array<{ title: string; description: string; revealAtSeconds?: number | undefined }>>().notNull(),
  staticObjects: jsonb('static_objects').$type<ScenarioInput['staticObjects']>().notNull().default([]),
  backgroundAssetId: uuid('background_asset_id'),
  videoAssetId: uuid('video_asset_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('scenarios_updated_idx').on(table.updatedAt)])

export const scenarioAssets = pgTable('scenario_assets', {
  id: uuid('id').primaryKey(),
  scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  originalPath: text('original_path').notNull(),
  runtimePath: text('runtime_path').notNull(),
  thumbnailPath: text('thumbnail_path'),
  posterPath: text('poster_path'),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  width: integer('width'),
  height: integer('height'),
  sha256: text('sha256').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('scenario_assets_scenario_idx').on(table.scenarioId)])

export const scenarioInjects = pgTable('scenario_injects', {
  id: uuid('id').primaryKey(),
  scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  revealAtSeconds: integer('reveal_at_seconds'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
})

export const apparatusTemplates = pgTable('apparatus_templates', {
  id: text('id').primaryKey(),
  designation: text('designation').notNull(),
  kind: text('kind').notNull(),
  assetPath: text('asset_path').notNull(),
  realLengthFt: real('real_length_ft'),
  realWidthFt: real('real_width_ft'),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull().default({}),
})

export const apparatusCapabilities = pgTable('apparatus_capabilities', {
  apparatusTemplateId: text('apparatus_template_id').notNull().references(() => apparatusTemplates.id, { onDelete: 'cascade' }),
  capability: text('capability').notNull(),
}, (table) => [uniqueIndex('apparatus_capability_unique').on(table.apparatusTemplateId, table.capability)])

export const hoseTypes = pgTable('hose_types', {
  id: text('id').primaryKey(),
  insideDiameterIn: real('inside_diameter_in').notNull(),
  coupling: text('coupling').notNull(),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull().default({}),
})

export const nozzleTypes = pgTable('nozzle_types', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  coupling: text('coupling').notNull(),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull().default({}),
})

export const applianceTypes = pgTable('appliance_types', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull().default({}),
})

export const evolutionDefinitions = pgTable('evolution_definitions', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  summary: text('summary').notNull(),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull().default({}),
})

export const evolutionStages = pgTable('evolution_stages', {
  id: uuid('id').primaryKey(),
  evolutionId: text('evolution_id').notNull().references(() => evolutionDefinitions.id, { onDelete: 'cascade' }),
  ordinal: integer('ordinal').notNull(),
  configuration: jsonb('configuration').$type<Record<string, unknown>>().notNull(),
}, (table) => [uniqueIndex('evolution_stage_unique').on(table.evolutionId, table.ordinal)])

export const trainingSessions = pgTable('training_sessions', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  scenarioId: uuid('scenario_id').notNull().references(() => scenarios.id),
  participatingUnits: jsonb('participating_units').$type<string[]>().notNull(),
  mode300: text('mode_300').notNull(),
  status: text('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  frozen300Plan: bytea('frozen_300_plan'),
  presentationMode: text('presentation_mode').notNull().default('operations'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('training_sessions_scenario_idx').on(table.scenarioId)])

export const sessionParticipants = pgTable('session_participants', {
  id: uuid('id').primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => trainingSessions.id, { onDelete: 'cascade' }),
  clientId: text('client_id').notNull(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  role: text('role').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('session_participant_client_unique').on(table.sessionId, table.clientId),
  index('session_participant_unit_idx').on(table.sessionId, table.unit),
])

export const sessionEvents = pgTable('session_events', {
  id: uuid('id').primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => trainingSessions.id, { onDelete: 'cascade' }),
  workspace: text('workspace').notNull(),
  elapsedMs: integer('elapsed_ms').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  actorClientId: text('actor_client_id').notNull(),
  actorName: text('actor_name').notNull(),
  actorUnit: text('actor_unit').notNull(),
  eventType: text('event_type').notNull(),
  objectId: text('object_id'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
}, (table) => [index('session_events_timeline_idx').on(table.sessionId, table.elapsedMs)])

export const yjsDocuments = pgTable('yjs_documents', {
  name: text('name').primaryKey(),
  state: bytea('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceSnapshots = pgTable('workspace_snapshots', {
  id: uuid('id').primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => trainingSessions.id, { onDelete: 'cascade' }),
  workspace: text('workspace').notNull(),
  reason: text('reason').notNull(),
  state: bytea('state').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const exerciseResults = pgTable('exercise_results', {
  id: uuid('id').primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => trainingSessions.id, { onDelete: 'cascade' }),
  summary: jsonb('summary').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
