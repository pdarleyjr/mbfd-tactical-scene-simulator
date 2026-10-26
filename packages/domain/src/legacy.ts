import { defaultBenchmarkCatalog, defaultHoseLoads, findApparatusTemplate, findMarker, type MarkerType } from './catalog.js'
import { salvageObjects, type Scenario, type SceneObject } from './scene.js'

/**
 * Converts a V2 (multi-user server) scenario record, as returned by
 * `GET /api/scenarios`, into V3 scenario settings and scene objects.
 *
 * V2 attribution fields (creator client, unit, name) are dropped: the V3
 * simulator has a single operator. Hose bundles were package markers with no
 * geometry of their own and are reported rather than converted.
 */
export interface LegacyConversion {
  scenario: Scenario
  objects: SceneObject[]
  warnings: string[]
}

type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const legacyMarkerMap: Record<string, string> = {
  'command-post': 'command-post',
  victim: 'victim',
  hazard: 'hazard',
  'collapse-zone': 'collapse-zone',
  division: 'division',
  entry: 'entry',
}

const legacyPortMap: Record<string, string> = {
  storz: 'storz',
  'intake-storz': 'intake',
  'discharge-2.5': 'discharge-2.5',
  'discharge-1.5': 'discharge-1.5',
  inlet: 'inlet',
  'outlet-a': 'outlet-a',
  'outlet-b': 'outlet-b',
}

function convertReference(value: unknown) {
  const reference = record(value)
  const objectId = text(reference.objectId)
  const portId = legacyPortMap[text(reference.portId)]
  return objectId && portId ? { objectId, portId } : undefined
}

export function convertLegacyObject(value: unknown, labelCounts: Map<string, number>): SceneObject | { skipped: string } {
  const object = record(value)
  const base = {
    id: text(object.id, crypto.randomUUID()),
    x: finite(object.x, 0),
    y: finite(object.y, 0),
    rotation: finite(object.rotation, 0),
    locked: object.locked === true,
  }
  switch (object.type) {
    case 'apparatus': {
      const template = findApparatusTemplate(text(object.apparatusTemplateId))
      if (!template) return { skipped: `Unknown apparatus template ${text(object.apparatusTemplateId) || '(none)'}` }
      const count = (labelCounts.get(template.id) ?? 0) + 1
      labelCounts.set(template.id, count)
      return { ...base, type: 'apparatus', templateId: template.id, label: count === 1 ? template.id : `${template.id}-${count}`, assignment: '' }
    }
    case 'hydrant':
      return {
        ...base,
        type: 'hydrant',
        label: text(object.label, 'Hydrant') || 'Hydrant',
        status: (['available', 'out-of-service', 'low-pressure', 'unknown'] as const).find((status) => status === object.status) ?? 'unknown',
        notes: '',
      }
    case 'hoseSegment': {
      const points = Array.isArray(object.points) ? object.points.filter((point): point is number => typeof point === 'number' && Number.isFinite(point)) : []
      if (points.length < 4) return { skipped: 'Hose without a usable path' }
      const hoseType = (['attack175', 'hose3', 'supply5'] as const).find((type) => type === object.hoseType) ?? 'supply5'
      const layDirection = object.layDirection === 'hydrant-to-apparatus' ? 'forward' as const : object.layDirection === 'apparatus-to-hydrant' ? 'reverse' as const : undefined
      const from = convertReference(object.connectedFrom)
      const to = convertReference(object.connectedTo)
      return {
        id: base.id,
        type: 'hose',
        hoseType,
        purpose: hoseType === 'supply5' ? 'supply' : object.layDirection === 'feeder' ? 'feeder' : 'attack',
        points: points.slice(0, points.length - (points.length % 2)),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(layDirection ? { layDirection } : {}),
        label: '',
        locked: base.locked,
      }
    }
    case 'appliance':
      return { ...base, type: 'appliance', applianceType: 'gated-wye' }
    case 'nozzle':
      return { ...base, type: 'nozzle', nozzleType: object.nozzleType === 'smooth-bore' ? 'smooth-bore' : 'fog' }
    case 'annotation': {
      const note = text(object.text).trim()
      return note ? { ...base, type: 'note', text: note.slice(0, 500) } : { skipped: 'Empty annotation' }
    }
    case 'tacticalMarker': {
      const markerType = legacyMarkerMap[text(object.markerType)]
      if (!markerType || !findMarker(markerType)) return { skipped: `Unknown marker ${text(object.markerType)}` }
      return { ...base, type: 'marker', markerType: markerType as MarkerType, label: text(object.label).slice(0, 40) }
    }
    case 'hoseBundle':
      return { skipped: 'Hose package marker (V2 bundles carried no geometry)' }
    default:
      return { skipped: `Unsupported object type ${text(object.type) || '(none)'}` }
  }
}

export function convertLegacyScenario(input: unknown): LegacyConversion {
  const source = record(input)
  const warnings: string[] = []
  const assets = Array.isArray(source.assets) ? source.assets.map(record) : []
  const backgroundAsset = assets.find((asset) => asset.kind === 'background')
  const videoAsset = assets.find((asset) => asset.kind === 'video')
  const backgroundUrl = text(backgroundAsset?.runtimeUrl) || (text(backgroundAsset?.runtimePath) ? `/scenario-assets/${text(backgroundAsset?.runtimePath)}` : '')
  if (!backgroundUrl) warnings.push('The scenario has no background image; attach one in Scenario settings.')
  const videoUrl = text(videoAsset?.runtimeUrl) || (text(videoAsset?.runtimePath) ? `/scenario-assets/${text(videoAsset?.runtimePath)}` : '')
  const posterUrl = text(videoAsset?.posterUrl) || (text(videoAsset?.posterPath) ? `/scenario-assets/${text(videoAsset?.posterPath)}` : '')

  const labelCounts = new Map<string, number>()
  const converted: unknown[] = []
  for (const candidate of Array.isArray(source.staticObjects) ? source.staticObjects : []) {
    const result = convertLegacyObject(candidate, labelCounts)
    if ('skipped' in result) warnings.push(result.skipped)
    else converted.push(result)
  }
  const { objects, dropped } = salvageObjects(converted)
  if (dropped) warnings.push(`${dropped} object(s) failed validation and were not imported.`)

  const injects = (Array.isArray(source.injects) ? source.injects : []).map(record).filter((inject) => text(inject.title).trim()).map((inject, index) => ({
    id: `inject-${index + 1}`,
    title: text(inject.title).trim().slice(0, 160),
    description: text(inject.description).trim().slice(0, 2000),
    ...(typeof inject.revealAtSeconds === 'number' && Number.isInteger(inject.revealAtSeconds) && inject.revealAtSeconds >= 0 ? { revealAtSeconds: inject.revealAtSeconds } : {}),
  }))
  const benchmarks = (Array.isArray(source.benchmarks) ? source.benchmarks : defaultBenchmarkCatalog).map(record).filter((benchmark) => text(benchmark.label).trim()).map((benchmark, index) => ({
    id: text(benchmark.id) || `benchmark-${index + 1}`,
    label: text(benchmark.label).trim().slice(0, 160),
    description: text(benchmark.description).trim().slice(0, 1000),
  }))
  const feetPerWorldUnit = typeof source.feetPerWorldUnit === 'number' && source.feetPerWorldUnit > 0 ? source.feetPerWorldUnit : undefined
  if (feetPerWorldUnit) warnings.push('V2 stored a feet-per-unit value without a reference measurement; re-calibrate to confirm it.')

  const scenario: Scenario = {
    title: text(source.title, 'Imported scenario').trim().slice(0, 160) || 'Imported scenario',
    description: text(source.description).trim().slice(0, 4000),
    dispatch: text(source.dispatchInformation).trim().slice(0, 4000),
    background: { kind: 'builtin', url: backgroundUrl || '/scenario-assets/seed/background.webp' },
    world: { width: finite(source.worldWidth, 1600), height: finite(source.worldHeight, 1000) },
    ...(videoUrl ? { video: { kind: 'builtin' as const, url: videoUrl } } : {}),
    ...(posterUrl ? { poster: { kind: 'builtin' as const, url: posterUrl } } : {}),
    conditions: { windFromDeg: null, windNote: '', northDeg: 0, weather: '' },
    injects,
    benchmarks,
    hoseLoads: structuredClone(defaultHoseLoads),
    apparatusLengthFt: {},
  }
  return { scenario, objects, warnings }
}
