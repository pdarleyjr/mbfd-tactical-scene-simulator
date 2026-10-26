import { z } from 'zod'
import { apparatusTemplateIds, defaultHoseLoads, markerCatalog, type ApparatusTemplateId, type MarkerType } from './catalog.js'

export const SCENE_SCHEMA_VERSION = 3

const idSchema = z.string().min(1).max(128)
const coordinateSchema = z.number().finite().min(-100_000).max(100_000)
const rotationSchema = z.number().finite().min(-3600).max(3600)
const pointsSchema = z.array(coordinateSchema).min(4).max(20_000).refine((points) => points.length % 2 === 0, 'Points must be x/y pairs.')

export const pointSchema = z.object({ x: coordinateSchema, y: coordinateSchema })

export const portRefSchema = z.object({
  objectId: idSchema,
  portId: z.string().min(1).max(64),
})

const placedShape = {
  id: idSchema,
  x: coordinateSchema,
  y: coordinateSchema,
  rotation: rotationSchema.default(0),
  locked: z.boolean().default(false),
}

const templateIdSchema = z.enum(apparatusTemplateIds as [ApparatusTemplateId, ...ApparatusTemplateId[]])
const markerTypeSchema = z.enum(markerCatalog.map((marker) => marker.id) as [MarkerType, ...MarkerType[]])
export const hoseTypeSchema = z.enum(['attack175', 'hose3', 'supply5'])
export const hosePurposeSchema = z.enum(['attack', 'feeder', 'supply'])
export const evolutionIdSchema = z.enum(['forward-lay', 'reverse-lay', 'jumpline', 'skid-load', 'high-rise-pack'])

export const apparatusObjectSchema = z.object({
  ...placedShape,
  type: z.literal('apparatus'),
  templateId: templateIdSchema,
  label: z.string().trim().min(1).max(24),
  assignment: z.string().trim().max(60).default(''),
})

export const hydrantObjectSchema = z.object({
  ...placedShape,
  type: z.literal('hydrant'),
  label: z.string().trim().min(1).max(24).default('Hydrant'),
  status: z.enum(['available', 'out-of-service', 'low-pressure', 'unknown']).default('unknown'),
  notes: z.string().max(500).default(''),
})

export const hoseObjectSchema = z.object({
  id: idSchema,
  type: z.literal('hose'),
  hoseType: hoseTypeSchema,
  purpose: hosePurposeSchema,
  /** Flattened x/y pairs. Oriented source → destination once both ends connect. */
  points: pointsSchema,
  from: portRefSchema.optional(),
  to: portRefSchema.optional(),
  evolution: evolutionIdSchema.optional(),
  layDirection: z.enum(['forward', 'reverse']).optional(),
  /** Configured load length captured when the line was laid. */
  loadFt: z.number().positive().max(10_000).optional(),
  label: z.string().trim().max(40).default(''),
  locked: z.boolean().default(false),
})

export const applianceObjectSchema = z.object({
  ...placedShape,
  type: z.literal('appliance'),
  applianceType: z.literal('gated-wye'),
})

export const nozzleObjectSchema = z.object({
  ...placedShape,
  type: z.literal('nozzle'),
  nozzleType: z.enum(['fog', 'smooth-bore']),
})

export const markerObjectSchema = z.object({
  ...placedShape,
  type: z.literal('marker'),
  markerType: markerTypeSchema,
  label: z.string().trim().max(40).default(''),
  radius: z.number().positive().max(5000).optional(),
})

export const noteObjectSchema = z.object({
  ...placedShape,
  type: z.literal('note'),
  text: z.string().trim().min(1).max(500),
})

export const arrowObjectSchema = z.object({
  id: idSchema,
  type: z.literal('arrow'),
  points: pointsSchema,
  color: z.enum(['white', 'yellow', 'red', 'blue']).default('white'),
  label: z.string().trim().max(40).default(''),
  locked: z.boolean().default(false),
})

export const measurementObjectSchema = z.object({
  id: idSchema,
  type: z.literal('measurement'),
  points: pointsSchema,
  locked: z.boolean().default(false),
})

export const sceneObjectSchema = z.discriminatedUnion('type', [
  apparatusObjectSchema,
  hydrantObjectSchema,
  hoseObjectSchema,
  applianceObjectSchema,
  nozzleObjectSchema,
  markerObjectSchema,
  noteObjectSchema,
  arrowObjectSchema,
  measurementObjectSchema,
])

export const mediaRefSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('builtin'), url: z.string().min(1).max(500) }),
  z.object({ kind: z.literal('blob'), blobId: idSchema, mimeType: z.string().min(1).max(100), name: z.string().max(200).default('') }),
])

export const calibrationSchema = z.object({
  feetPerWorldUnit: z.number().positive().max(1000),
  a: pointSchema,
  b: pointSchema,
  distanceFt: z.number().positive().max(100_000),
  reference: z.string().trim().max(120).default(''),
  calibratedAt: z.string().max(40),
})

export const injectSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(''),
  revealAtSeconds: z.number().int().nonnegative().max(86_400).optional(),
})

export const benchmarkSchema = z.object({
  id: idSchema,
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(''),
})

export const conditionsSchema = z.object({
  /** Direction the wind blows from, degrees clockwise from map-up. */
  windFromDeg: z.number().finite().min(0).max(360).nullable().default(null),
  windNote: z.string().trim().max(80).default(''),
  /** Direction of true north, degrees clockwise from map-up. */
  northDeg: z.number().finite().min(0).max(360).default(0),
  weather: z.string().trim().max(200).default(''),
})

const lengthRecord = z.object({ attack175: z.number().positive().max(1000), hose3: z.number().positive().max(1000), supply5: z.number().positive().max(1000) })

export const hoseLoadsSchema = z.object({
  sectionLengthFt: lengthRecord,
  loadLengthFt: z.object({
    'forward-lay': z.number().positive().max(10_000),
    'reverse-lay': z.number().positive().max(10_000),
    jumpline: z.number().positive().max(10_000),
    'skid-load': z.number().positive().max(10_000),
    'skid-load-attack': z.number().positive().max(10_000),
    'high-rise-pack': z.number().positive().max(10_000),
  }),
})

export const scenarioSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).default(''),
  dispatch: z.string().trim().max(4000).default(''),
  background: mediaRefSchema,
  world: z.object({ width: z.number().positive().max(100_000), height: z.number().positive().max(100_000) }),
  video: mediaRefSchema.optional(),
  poster: mediaRefSchema.optional(),
  calibration: calibrationSchema.optional(),
  conditions: conditionsSchema.default({ windFromDeg: null, windNote: '', northDeg: 0, weather: '' }),
  injects: z.array(injectSchema).max(200).default([]),
  benchmarks: z.array(benchmarkSchema).max(200).default([]),
  hoseLoads: hoseLoadsSchema.default(defaultHoseLoads),
  /** Operator-entered overall lengths; only used when the map is calibrated. */
  apparatusLengthFt: z.partialRecord(templateIdSchema, z.number().positive().max(200)).default({}),
})

export const timerSchema = z.object({
  running: z.boolean(),
  startedAt: z.number().nullable(),
  accumulatedMs: z.number().nonnegative(),
})

export const trainingSchema = z.object({
  timer: timerSchema.default({ running: false, startedAt: null, accumulatedMs: 0 }),
  revealed: z.record(z.string(), z.number().nonnegative()).default({}),
  completed: z.record(z.string(), z.number().nonnegative()).default({}),
  notes: z.string().max(20_000).default(''),
})

export const snapshotSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(120),
  createdAt: z.string().max(40),
  elapsedMs: z.number().nonnegative().nullable(),
  objects: z.array(sceneObjectSchema).max(5000),
})

export const timelineEntrySchema = z.object({
  id: idSchema,
  at: z.number().nonnegative(),
  kind: z.enum(['change', 'benchmark', 'inject', 'snapshot', 'note']),
  label: z.string().max(200),
  upserts: z.array(sceneObjectSchema).optional(),
  removes: z.array(idSchema).optional(),
  order: z.array(idSchema).optional(),
})

export const runSchema = z.object({
  startedAt: z.string().max(40),
  base: z.array(sceneObjectSchema).max(5000),
  entries: z.array(timelineEntrySchema).max(20_000),
})

export const boardSchema = z.object({
  schemaVersion: z.literal(SCENE_SCHEMA_VERSION),
  id: idSchema,
  name: z.string().trim().min(1).max(120),
  templateId: z.string().max(80).nullable(),
  createdAt: z.string().max(40),
  updatedAt: z.string().max(40),
  scenario: scenarioSchema,
  objects: z.array(sceneObjectSchema).max(5000),
  training: trainingSchema,
  snapshots: z.array(snapshotSchema).max(100).default([]),
  run: runSchema.nullable().default(null),
})

export const exportFileSchema = z.object({
  format: z.literal('mbfd-tactical-scene'),
  version: z.literal(SCENE_SCHEMA_VERSION),
  exportedAt: z.string().max(40),
  board: boardSchema,
  media: z.array(z.object({
    blobId: idSchema,
    mimeType: z.string().min(1).max(100),
    name: z.string().max(200).default(''),
    dataUrl: z.string().startsWith('data:'),
  })).default([]),
})

export type Point = z.infer<typeof pointSchema>
export type PortRef = z.infer<typeof portRefSchema>
export type ApparatusObject = z.infer<typeof apparatusObjectSchema>
export type HydrantObject = z.infer<typeof hydrantObjectSchema>
export type HoseObject = z.infer<typeof hoseObjectSchema>
export type ApplianceObject = z.infer<typeof applianceObjectSchema>
export type NozzleObject = z.infer<typeof nozzleObjectSchema>
export type MarkerObject = z.infer<typeof markerObjectSchema>
export type NoteObject = z.infer<typeof noteObjectSchema>
export type ArrowObject = z.infer<typeof arrowObjectSchema>
export type MeasurementObject = z.infer<typeof measurementObjectSchema>
export type SceneObject = z.infer<typeof sceneObjectSchema>
export type PlacedObject = ApparatusObject | HydrantObject | ApplianceObject | NozzleObject | MarkerObject | NoteObject
export type PathObject = HoseObject | ArrowObject | MeasurementObject
export type MediaRef = z.infer<typeof mediaRefSchema>
export type Calibration = z.infer<typeof calibrationSchema>
export type Inject = z.infer<typeof injectSchema>
export type Benchmark = z.infer<typeof benchmarkSchema>
export type Conditions = z.infer<typeof conditionsSchema>
export type HoseLoads = z.infer<typeof hoseLoadsSchema>
export type Scenario = z.infer<typeof scenarioSchema>
export type TimerState = z.infer<typeof timerSchema>
export type Training = z.infer<typeof trainingSchema>
export type Snapshot = z.infer<typeof snapshotSchema>
export type TimelineEntry = z.infer<typeof timelineEntrySchema>
export type Run = z.infer<typeof runSchema>
export type Board = z.infer<typeof boardSchema>
export type ExportFile = z.infer<typeof exportFileSchema>

export function isPathObject(object: SceneObject): object is PathObject {
  return object.type === 'hose' || object.type === 'arrow' || object.type === 'measurement'
}

export function isPlacedObject(object: SceneObject): object is PlacedObject {
  return !isPathObject(object)
}

/**
 * Recovers a saved board that no longer passes validation, field by field,
 * so one bad value never costs the operator the rest of their work. Fields
 * that cannot be read fall back to `fallbackScenario` (required fields only)
 * or are dropped (optional fields). Returns undefined for non-objects.
 */
export function repairBoard(raw: unknown, fallbackScenario: Scenario): { board: Board; repaired: boolean } | undefined {
  const parsed = boardSchema.safeParse(raw)
  if (parsed.success) return { board: parsed.data, repaired: false }
  if (!raw || typeof raw !== 'object') return undefined
  const candidate = raw as Record<string, unknown>
  const source = candidate.scenario && typeof candidate.scenario === 'object' ? candidate.scenario as Record<string, unknown> : {}
  const shape = scenarioSchema.shape
  const scenario: Record<string, unknown> = {}
  for (const key of Object.keys(shape) as Array<keyof typeof shape>) {
    const field = shape[key].safeParse(source[key])
    if (field.success && field.data !== undefined) scenario[key] = field.data
    else if (key in source && key === 'apparatusLengthFt' && source[key] && typeof source[key] === 'object') {
      scenario[key] = Object.fromEntries(Object.entries(source[key] as Record<string, unknown>).filter(([id, value]) => apparatusTemplateIds.includes(id as ApparatusTemplateId) && typeof value === 'number' && value > 0 && value <= 200))
    } else if (key === 'hoseLoads') {
      const loads = (source.hoseLoads ?? {}) as { sectionLengthFt?: Record<string, unknown>; loadLengthFt?: Record<string, unknown> }
      const pick = <T extends Record<string, number>>(defaults: T, values: Record<string, unknown> | undefined, max: number): T => Object.fromEntries(Object.entries(defaults).map(([id, fallback]) => {
        const value = values?.[id]
        return [id, typeof value === 'number' && value > 0 && value <= max ? value : fallback]
      })) as T
      scenario.hoseLoads = { sectionLengthFt: pick(defaultHoseLoads.sectionLengthFt, loads.sectionLengthFt, 1000), loadLengthFt: pick(defaultHoseLoads.loadLengthFt, loads.loadLengthFt, 10_000) }
    } else if (['title', 'background', 'world'].includes(key)) {
      scenario[key] = fallbackScenario[key as 'title' | 'background' | 'world']
    }
  }
  const scenarioResult = scenarioSchema.safeParse(scenario)
  const { objects } = salvageObjects(candidate.objects)
  const training = trainingSchema.safeParse(candidate.training)
  const snapshots = Array.isArray(candidate.snapshots) ? candidate.snapshots.flatMap((snapshot) => { const result = snapshotSchema.safeParse(snapshot); return result.success ? [result.data] : [] }) : []
  const run = runSchema.safeParse(candidate.run)
  const now = new Date().toISOString()
  const text = (value: unknown, fallback: string, max: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback
  const board = boardSchema.safeParse({
    schemaVersion: SCENE_SCHEMA_VERSION,
    id: text(candidate.id, crypto.randomUUID(), 128),
    name: text(candidate.name, fallbackScenario.title, 120),
    templateId: typeof candidate.templateId === 'string' ? candidate.templateId.slice(0, 80) : null,
    createdAt: text(candidate.createdAt, now, 40),
    updatedAt: now,
    scenario: scenarioResult.success ? scenarioResult.data : fallbackScenario,
    objects,
    training: training.success ? training.data : { timer: { running: false, startedAt: null, accumulatedMs: 0 }, revealed: {}, completed: {}, notes: '' },
    snapshots: snapshots.slice(-100),
    run: run.success ? run.data : null,
  })
  return board.success ? { board: board.data, repaired: true } : undefined
}

/**
 * Validates objects one at a time so a single damaged object never prevents
 * the rest of a saved scene from loading.
 */
export function salvageObjects(input: unknown): { objects: SceneObject[]; dropped: number } {
  if (!Array.isArray(input)) return { objects: [], dropped: 0 }
  const objects: SceneObject[] = []
  let dropped = 0
  for (const candidate of input) {
    const parsed = sceneObjectSchema.safeParse(candidate)
    if (parsed.success) objects.push(parsed.data)
    else dropped += 1
  }
  return { objects, dropped }
}
