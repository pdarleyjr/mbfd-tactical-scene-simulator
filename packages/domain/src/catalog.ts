/**
 * Reference catalog for the simulator.
 *
 * Apparatus lengths, intake positions, hose section lengths, and hose loads
 * are MBFD-provided figures (2026-10-26). Discharge positions remain
 * schematic: they sit at the pump panel beside the published intake.
 */

export type ApparatusTemplateId = 'E1' | 'E2' | 'E3' | 'E4' | 'L1' | 'L3' | 'R1' | 'R2' | 'R3' | 'R4'
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

export type ApparatusModelId = 'pierce-puc' | 'pierce-arrow-xt' | 'pierce-ascendant' | 'pierce-dash-2000' | 'horton-rescue'

export interface ApparatusModel {
  id: ApparatusModelId
  label: string
  lengthFt: number
  /** Driver's-side large-diameter intake, measured from the front bumper. */
  intakeFromFrontFt: number | null
  pump: boolean
}

export const apparatusModels: Record<ApparatusModelId, ApparatusModel> = {
  'pierce-puc': { id: 'pierce-puc', label: 'Pierce PUC pumper', lengthFt: 32 + 9 / 12, intakeFromFrontFt: 13, pump: true },
  'pierce-arrow-xt': { id: 'pierce-arrow-xt', label: 'Pierce Arrow XT 100′ ladder quint', lengthFt: 42 + 2 / 12, intakeFromFrontFt: 16, pump: true },
  'pierce-ascendant': { id: 'pierce-ascendant', label: 'Pierce Ascendant 100′ tower', lengthFt: 43, intakeFromFrontFt: 17, pump: true },
  'pierce-dash-2000': { id: 'pierce-dash-2000', label: 'Pierce Dash 2000 100′ platform', lengthFt: 46, intakeFromFrontFt: 16, pump: true },
  'horton-rescue': { id: 'horton-rescue', label: 'Horton rescue (2-door cab)', lengthFt: 25 + 10 / 12, intakeFromFrontFt: null, pump: false },
}

export const apparatusModelIds = Object.keys(apparatusModels) as ApparatusModelId[]

export interface ApparatusTemplate {
  id: ApparatusTemplateId
  designation: string
  kind: 'engine' | 'aerial' | 'rescue'
  /** Top-down artwork, front of the vehicle at the top of the image. */
  assetPath: string
  /** Width ÷ height of the artwork, used so vehicles are never stretched. */
  imageAspect: number
  model: ApparatusModelId
}

const art = (name: string) => `/scenario-assets/seed/apparatus/${name}.webp`

export const apparatusCatalog: readonly ApparatusTemplate[] = [
  { id: 'E1', designation: 'Engine 1', kind: 'engine', assetPath: art('E1'), imageAspect: 368 / 1402, model: 'pierce-puc' },
  { id: 'E2', designation: 'Engine 2', kind: 'engine', assetPath: art('E2'), imageAspect: 371 / 1394, model: 'pierce-puc' },
  { id: 'E3', designation: 'Engine 3', kind: 'engine', assetPath: art('E3'), imageAspect: 366 / 1406, model: 'pierce-puc' },
  { id: 'E4', designation: 'Engine 4', kind: 'engine', assetPath: art('E4'), imageAspect: 368 / 1405, model: 'pierce-puc' },
  { id: 'L1', designation: 'Ladder 1', kind: 'aerial', assetPath: art('L1'), imageAspect: 362 / 1516, model: 'pierce-ascendant' },
  { id: 'L3', designation: 'Ladder 3', kind: 'aerial', assetPath: art('L3'), imageAspect: 342 / 1481, model: 'pierce-arrow-xt' },
  { id: 'R1', designation: 'Rescue 1', kind: 'rescue', assetPath: art('Rescue'), imageAspect: 302 / 1000, model: 'horton-rescue' },
  { id: 'R2', designation: 'Rescue 2', kind: 'rescue', assetPath: art('Rescue'), imageAspect: 302 / 1000, model: 'horton-rescue' },
  { id: 'R3', designation: 'Rescue 3', kind: 'rescue', assetPath: art('Rescue'), imageAspect: 302 / 1000, model: 'horton-rescue' },
  { id: 'R4', designation: 'Rescue 4', kind: 'rescue', assetPath: art('Rescue'), imageAspect: 302 / 1000, model: 'horton-rescue' },
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

export type EvolutionId = 'forward-lay' | 'reverse-lay' | 'jumpline' | 'trashline' | 'skid-load' | 'high-rise-pack'

export interface EvolutionDefinition {
  id: EvolutionId
  label: string
  summary: string
}

export const evolutionCatalog: readonly EvolutionDefinition[] = [
  { id: 'jumpline', label: 'Preconnect / jumpline', summary: '1¾″, two 100′ sections, finished with a nozzle' },
  { id: 'trashline', label: 'Trash line', summary: '1¾″, 100′ section plus a 50′ roll' },
  { id: 'high-rise-pack', label: 'High-rise pack', summary: '1¾″, two 100′ packs connected' },
  { id: 'forward-lay', label: 'Forward lay', summary: '5″ from the hydrant to the engine intake' },
  { id: 'reverse-lay', label: 'Reverse lay', summary: '5″ from the engine intake to the hydrant' },
  { id: 'skid-load', label: '3″ to gated wye', summary: '3″ line to a gated wye, then a 1¾″ attack line' },
]

/** MBFD hose: section lengths and what each apparatus carries. */
export interface HoseLoadSettings {
  sectionLengthFt: Record<HoseType, number>
  loadLengthFt: Record<EvolutionId | 'skid-load-attack', number>
}

export const defaultHoseLoads: HoseLoadSettings = {
  sectionLengthFt: { attack175: 100, hose3: 50, supply5: 100 },
  loadLengthFt: { 'forward-lay': 800, 'reverse-lay': 800, jumpline: 200, trashline: 150, 'skid-load': 800, 'skid-load-attack': 200, 'high-rise-pack': 200 },
}

/** The V2 defaults, used only to recognise boards that never had MBFD values. */
export const legacyHoseLoads: HoseLoadSettings = {
  sectionLengthFt: { attack175: 100, hose3: 100, supply5: 100 },
  loadLengthFt: { 'forward-lay': 500, 'reverse-lay': 500, jumpline: 100, trashline: 150, 'skid-load': 300, 'skid-load-attack': 200, 'high-rise-pack': 200 },
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
