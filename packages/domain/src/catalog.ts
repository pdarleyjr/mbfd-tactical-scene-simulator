/**
 * Reference catalog for the simulator.
 *
 * Every number here is either a drawing default (world units on the scene
 * image) or a value carried forward from the V2 simulator. None of them is a
 * verified MBFD equipment fact; the UI labels them accordingly and lets the
 * operator override them per scenario.
 */

export type ApparatusTemplateId = 'E1' | 'E2' | 'E3' | 'E4' | 'L1' | 'L3'
export type PortSize = 'nh-1.5' | 'nh-2.5' | 'storz-5'
export type PortDirection = 'inlet' | 'outlet'

export interface PortDefinition {
  id: string
  label: string
  size: PortSize
  direction: PortDirection
  /** Local offset in world units; -y is the front of the object. */
  x: number
  y: number
}

export interface ApparatusTemplate {
  id: ApparatusTemplateId
  designation: string
  kind: 'engine' | 'aerial'
  /** Top-down artwork, front of the vehicle at the top of the image. */
  assetPath: string
  /** Width ÷ height of the artwork, used so vehicles are never stretched. */
  imageAspect: number
  /** Drawing length on the scene when no verified length is configured. */
  defaultLengthWorld: number
  /** Real overall length. Unknown until MBFD supplies a verified value. */
  verifiedLengthFt: null
}

export const apparatusCatalog: readonly ApparatusTemplate[] = [
  { id: 'E1', designation: 'Engine 1', kind: 'engine', assetPath: '/scenario-assets/seed/apparatus/E1.webp', imageAspect: 368 / 1402, defaultLengthWorld: 74, verifiedLengthFt: null },
  { id: 'E2', designation: 'Engine 2', kind: 'engine', assetPath: '/scenario-assets/seed/apparatus/E2.webp', imageAspect: 371 / 1394, defaultLengthWorld: 74, verifiedLengthFt: null },
  { id: 'E3', designation: 'Engine 3', kind: 'engine', assetPath: '/scenario-assets/seed/apparatus/E3.webp', imageAspect: 366 / 1406, defaultLengthWorld: 74, verifiedLengthFt: null },
  { id: 'E4', designation: 'Engine 4', kind: 'engine', assetPath: '/scenario-assets/seed/apparatus/E4.webp', imageAspect: 368 / 1405, defaultLengthWorld: 74, verifiedLengthFt: null },
  { id: 'L1', designation: 'Ladder 1', kind: 'aerial', assetPath: '/scenario-assets/seed/apparatus/L1.webp', imageAspect: 362 / 1516, defaultLengthWorld: 104, verifiedLengthFt: null },
  { id: 'L3', designation: 'Ladder 3', kind: 'aerial', assetPath: '/scenario-assets/seed/apparatus/L3.webp', imageAspect: 342 / 1481, defaultLengthWorld: 104, verifiedLengthFt: null },
]

export const apparatusTemplateIds = apparatusCatalog.map((template) => template.id)

export function findApparatusTemplate(id: string): ApparatusTemplate | undefined {
  return apparatusCatalog.find((template) => template.id === id)
}

export type HoseType = 'attack175' | 'hose3' | 'supply5'
export type HosePurpose = 'attack' | 'feeder' | 'supply'

export interface HoseTypeDefinition {
  id: HoseType
  label: string
  shortLabel: string
  portSize: PortSize
  defaultPurpose: HosePurpose
  color: string
  /** Stroke width in screen pixels. */
  width: number
}

export const hoseCatalog: Record<HoseType, HoseTypeDefinition> = {
  attack175: { id: 'attack175', label: '1¾″ attack line', shortLabel: '1¾″', portSize: 'nh-1.5', defaultPurpose: 'attack', color: '#ff5b3a', width: 4.5 },
  hose3: { id: 'hose3', label: '3″ line', shortLabel: '3″', portSize: 'nh-2.5', defaultPurpose: 'feeder', color: '#f3efe4', width: 6 },
  supply5: { id: 'supply5', label: '5″ supply line', shortLabel: '5″', portSize: 'storz-5', defaultPurpose: 'supply', color: '#f6c633', width: 8 },
}

export type EvolutionId = 'forward-lay' | 'reverse-lay' | 'jumpline' | 'skid-load' | 'high-rise-pack'

export interface EvolutionDefinition {
  id: EvolutionId
  label: string
  summary: string
}

export const evolutionCatalog: readonly EvolutionDefinition[] = [
  { id: 'forward-lay', label: 'Forward lay', summary: '5″ supply laid from a hydrant to the engine intake' },
  { id: 'reverse-lay', label: 'Reverse lay', summary: '5″ supply laid from the engine intake to a hydrant' },
  { id: 'jumpline', label: 'Jumpline', summary: '1¾″ attack line from a discharge, finished with a nozzle' },
  { id: 'skid-load', label: 'Skid load', summary: '3″ feeder to a gated wye, then a 1¾″ attack line' },
  { id: 'high-rise-pack', label: 'High-rise pack', summary: '1¾″ attack line started at a standpipe or wye' },
]

/**
 * Load lengths and section lengths carried over from the V2 simulator. They
 * are editable per scenario and always shown as "configured", never verified.
 */
export interface HoseLoadSettings {
  sectionLengthFt: Record<HoseType, number>
  loadLengthFt: Record<EvolutionId | 'skid-load-attack', number>
}

export const defaultHoseLoads: HoseLoadSettings = {
  sectionLengthFt: { attack175: 100, hose3: 100, supply5: 100 },
  loadLengthFt: { 'forward-lay': 500, 'reverse-lay': 500, jumpline: 100, 'skid-load': 300, 'skid-load-attack': 200, 'high-rise-pack': 200 },
}

export type MarkerType =
  | 'command-post' | 'staging' | 'rit' | 'rehab' | 'entry' | 'victim'
  | 'hazard' | 'fire' | 'exposure' | 'ventilation' | 'collapse-zone' | 'division'

export interface MarkerDefinition {
  id: MarkerType
  label: string
  code: string
  color: string
  /** Area markers carry a radius and render as a zone. */
  area?: boolean
}

export const markerCatalog: readonly MarkerDefinition[] = [
  { id: 'command-post', label: 'Command post', code: 'CP', color: '#2f7fd6' },
  { id: 'staging', label: 'Staging', code: 'STG', color: '#6b8794' },
  { id: 'rit', label: 'RIT', code: 'RIT', color: '#c7372f' },
  { id: 'rehab', label: 'Rehab', code: 'REH', color: '#3d9a6a' },
  { id: 'entry', label: 'Entry point', code: 'ENT', color: '#e0a526' },
  { id: 'victim', label: 'Victim', code: 'VIC', color: '#e8eaeb' },
  { id: 'hazard', label: 'Hazard', code: 'HAZ', color: '#f08a24' },
  { id: 'fire', label: 'Fire location', code: 'FIRE', color: '#e2361f' },
  { id: 'exposure', label: 'Exposure', code: 'EXP', color: '#b06ad6' },
  { id: 'ventilation', label: 'Ventilation', code: 'VENT', color: '#7ab8d9' },
  { id: 'division', label: 'Division / side', code: 'DIV', color: '#d9c8a5' },
  { id: 'collapse-zone', label: 'Collapse zone', code: 'CZ', color: '#e2361f', area: true },
]

export function findMarker(id: string): MarkerDefinition | undefined {
  return markerCatalog.find((marker) => marker.id === id)
}

export const defaultBenchmarkCatalog = [
  { id: 'command-established', label: 'Command established', description: 'The incident command function is announced and operating.' },
  { id: 'initial-size-up', label: 'Initial size-up complete', description: 'The first-arriving unit communicates conditions, actions, and needs.' },
  { id: 'water-supply-established', label: 'Water supply established', description: 'A sustained water supply is connected and available.' },
  { id: 'initial-attack-line', label: 'Initial attack line in service', description: 'The initial attack line is deployed, charged, and operating.' },
  { id: 'primary-search-complete', label: 'Primary search complete', description: 'Primary search results are reported to command.' },
] as const
