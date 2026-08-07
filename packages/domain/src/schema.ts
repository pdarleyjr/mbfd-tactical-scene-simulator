import { z } from 'zod'

export const participantRoleSchema = z.enum(['crew', 'command300', 'instructor', 'presentation'])
export const mode300Schema = z.enum(['independent', 'live', 'hybrid'])
export const workspaceSchema = z.enum(['scenario', 'operations', '300-plan'])
export const permissionSchema = z.enum([
  'move-own-unit',
  'annotate',
  'command-markers',
  'move-other-units',
  'deploy-for-other-units',
  'instructor-control',
  'read-only',
])

export const unitIdSchema = z.string().trim().min(1).max(24)
export const roomCodeSchema = z.string().trim().regex(/^[A-HJ-NP-Z2-9]{6}$/)
export const worldCoordinateSchema = z.number().finite().min(-100_000).max(100_000)
export const isoTimestampSchema = z.iso.datetime({ offset: true })

export const pointSchema = z.object({
  x: worldCoordinateSchema,
  y: worldCoordinateSchema,
})

export const objectReferenceSchema = z.object({
  objectId: z.string().uuid().or(z.string().min(1).max(128)),
  portId: z.string().min(1).max(64),
})

export const couplingSchema = z.enum([
  'nh-1.5-male',
  'nh-1.5-female',
  'nh-2.5-male',
  'nh-2.5-female',
  'storz-5',
])

export const connectionPointSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  coupling: couplingSchema,
  direction: z.enum(['inlet', 'outlet', 'bidirectional']),
  x: z.number().finite(),
  y: z.number().finite(),
  occupiedBy: z.string().min(1).max(128).optional(),
})

const attributionShape = {
  createdByClientId: z.string().min(1).max(128),
  createdByName: z.string().min(1).max(80),
  createdByUnit: unitIdSchema,
  updatedByClientId: z.string().min(1).max(128).optional(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
}

const positionedObjectShape = {
  id: z.string().uuid().or(z.string().min(1).max(128)),
  x: worldCoordinateSchema,
  y: worldCoordinateSchema,
  rotation: z.number().finite().min(-3600).max(3600).default(0),
  locked: z.boolean().default(false),
  ...attributionShape,
}

export const apparatusObjectSchema = z.object({
  ...positionedObjectShape,
  type: z.literal('apparatus'),
  apparatusTemplateId: z.string().min(1).max(64),
  scale: z.number().positive().max(20).default(1),
  status: z.enum(['available', 'responding', 'positioned', 'committed']).default('positioned'),
  connectionPoints: z.array(connectionPointSchema).default([]),
})

export const hoseSegmentObjectSchema = z.object({
  ...positionedObjectShape,
  type: z.literal('hoseSegment'),
  hoseType: z.enum(['attack175', 'hose3', 'supply5']),
  coupling: couplingSchema,
  startCoupling: couplingSchema,
  endCoupling: couplingSchema,
  points: z.array(worldCoordinateSchema).min(4),
  nominalLengthFt: z.number().positive().max(5000),
  sectionCount: z.number().int().positive().max(100).default(1),
  layDirection: z.enum(['attack', 'hydrant-to-apparatus', 'apparatus-to-hydrant', 'feeder']),
  connectedFrom: objectReferenceSchema.optional(),
  connectedTo: objectReferenceSchema.optional(),
})

export const hoseBundleObjectSchema = z.object({
  ...positionedObjectShape,
  type: z.literal('hoseBundle'),
  bundleType: z.enum(['jumpline', 'high-rise-pack']),
  hoseType: z.literal('attack175'),
  sectionCount: z.number().int().positive(),
  nominalLengthFt: z.number().positive(),
  selectedNozzle: z.enum(['fog', 'smooth-bore']),
  deployedSegmentIds: z.array(z.string()).default([]),
})

export const applianceObjectSchema = z.object({
  ...positionedObjectShape,
  type: z.literal('appliance'),
  applianceType: z.literal('gated-wye'),
  connectionPoints: z.array(connectionPointSchema).length(3),
})

export const nozzleObjectSchema = z.object({
  ...positionedObjectShape,
  type: z.literal('nozzle'),
  nozzleType: z.enum(['fog', 'smooth-bore']),
  coupling: z.literal('nh-1.5-female'),
  connectedTo: objectReferenceSchema.optional(),
})

export const hydrantObjectSchema = z.object({
  ...positionedObjectShape,
  type: z.literal('hydrant'),
  label: z.string().min(1).max(80).default('Hydrant'),
  status: z.enum(['available', 'out-of-service', 'low-pressure', 'unknown']).default('unknown'),
  connectionPoints: z.array(connectionPointSchema).min(1),
  staticPressurePsi: z.number().nonnegative().optional(),
  residualPressurePsi: z.number().nonnegative().optional(),
  availableFlowGpm: z.number().nonnegative().optional(),
})

export const annotationObjectSchema = z.object({
  ...positionedObjectShape,
  type: z.literal('annotation'),
  text: z.string().trim().min(1).max(500),
})

export const tacticalMarkerObjectSchema = z.object({
  ...positionedObjectShape,
  type: z.literal('tacticalMarker'),
  markerType: z.enum(['command-post', 'victim', 'hazard', 'collapse-zone', 'division', 'entry']),
  label: z.string().trim().max(80).default(''),
})

export const firegroundObjectSchema = z.discriminatedUnion('type', [
  apparatusObjectSchema,
  hoseSegmentObjectSchema,
  hoseBundleObjectSchema,
  applianceObjectSchema,
  nozzleObjectSchema,
  hydrantObjectSchema,
  annotationObjectSchema,
  tacticalMarkerObjectSchema,
])

export const scenarioInjectInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2000),
  revealAtSeconds: z.number().int().nonnegative().optional(),
})

export const scenarioInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(1).max(4000),
  dispatchInformation: z.string().trim().max(4000).default(''),
  worldWidth: z.number().positive().max(100_000),
  worldHeight: z.number().positive().max(100_000),
  feetPerWorldUnit: z.number().positive().optional(),
  apparatusTemplateIds: z.array(z.string().min(1).max(64)).min(1),
  evolutionIds: z.array(z.string().min(1).max(64)).min(1),
  injects: z.array(scenarioInjectInputSchema).default([]),
  staticObjects: z.array(firegroundObjectSchema).default([]),
})

export const joinSessionInputSchema = z.object({
  code: roomCodeSchema,
  name: z.string().trim().min(1).max(80),
  role: z.enum(['crew', 'command300']),
  unit: unitIdSchema,
  clientId: z.string().min(1).max(128).optional(),
})

export const createSessionInputSchema = z.object({
  scenarioId: z.string().uuid().or(z.string().min(1).max(128)),
  participatingUnits: z.array(unitIdSchema).min(1),
  mode300: z.enum(['independent', 'live']),
})

export const tokenClaimsSchema = z.object({
  sessionId: z.string().min(1).max(128),
  clientId: z.string().min(1).max(128),
  name: z.string().min(1).max(80),
  unit: unitIdSchema,
  role: participantRoleSchema,
  mode300: mode300Schema,
  permissions: z.array(permissionSchema),
  exp: z.number().int().positive(),
  iat: z.number().int().positive(),
  jti: z.string().min(1).max(128),
})

export const domainEventSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().min(1),
  workspace: workspaceSchema,
  elapsedMs: z.number().int().nonnegative(),
  occurredAt: isoTimestampSchema,
  actorClientId: z.string().min(1),
  actorName: z.string().min(1),
  actorUnit: unitIdSchema,
  eventType: z.string().min(1).max(100),
  objectId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
})

export type ParticipantRole = z.infer<typeof participantRoleSchema>
export type Mode300 = z.infer<typeof mode300Schema>
export type Workspace = z.infer<typeof workspaceSchema>
export type Permission = z.infer<typeof permissionSchema>
export type ConnectionPoint = z.infer<typeof connectionPointSchema>
export type FiregroundObject = z.infer<typeof firegroundObjectSchema>
export type ScenarioInput = z.infer<typeof scenarioInputSchema>
export type JoinSessionInput = z.infer<typeof joinSessionInputSchema>
export type CreateSessionInput = z.infer<typeof createSessionInputSchema>
export type TokenClaims = z.infer<typeof tokenClaimsSchema>
export type DomainEvent = z.infer<typeof domainEventSchema>
