export interface ApparatusTemplate {
  id: 'E1' | 'E2' | 'E3' | 'E4' | 'L1' | 'L3'
  designation: string
  kind: 'engine' | 'mid-mount-aerial'
  assetPath: string
  realLengthFt: number | null
  realWidthFt: number | null
  displayLengthWorld: number
  displayWidthWorld: number
  calibrationStatus: 'unverified-configurable'
  capabilities: readonly string[]
}

const engineCapabilities = ['attack175', 'hose3', 'supply5', 'jumpline', 'skid-load', 'forward-lay', 'reverse-lay'] as const
const ladderCapabilities = ['attack175', 'supply5', 'high-rise-pack', 'forward-lay', 'reverse-lay'] as const

export const apparatusCatalog: readonly ApparatusTemplate[] = [
  { id: 'E1', designation: 'Engine 1', kind: 'engine', assetPath: '/scenario-assets/seed/apparatus/E1.png', realLengthFt: null, realWidthFt: null, displayLengthWorld: 74, displayWidthWorld: 28, calibrationStatus: 'unverified-configurable', capabilities: engineCapabilities },
  { id: 'E2', designation: 'Engine 2', kind: 'engine', assetPath: '/scenario-assets/seed/apparatus/E2.png', realLengthFt: null, realWidthFt: null, displayLengthWorld: 74, displayWidthWorld: 28, calibrationStatus: 'unverified-configurable', capabilities: engineCapabilities },
  { id: 'E3', designation: 'Engine 3', kind: 'engine', assetPath: '/scenario-assets/seed/apparatus/E3.png', realLengthFt: null, realWidthFt: null, displayLengthWorld: 74, displayWidthWorld: 28, calibrationStatus: 'unverified-configurable', capabilities: engineCapabilities },
  { id: 'E4', designation: 'Engine 4', kind: 'engine', assetPath: '/scenario-assets/seed/apparatus/E4.png', realLengthFt: null, realWidthFt: null, displayLengthWorld: 74, displayWidthWorld: 28, calibrationStatus: 'unverified-configurable', capabilities: engineCapabilities },
  { id: 'L1', designation: 'Ladder 1', kind: 'mid-mount-aerial', assetPath: '/scenario-assets/seed/apparatus/L1.png', realLengthFt: null, realWidthFt: null, displayLengthWorld: 104, displayWidthWorld: 30, calibrationStatus: 'unverified-configurable', capabilities: ladderCapabilities },
  { id: 'L3', designation: 'Ladder 3', kind: 'mid-mount-aerial', assetPath: '/scenario-assets/seed/apparatus/L3.png', realLengthFt: null, realWidthFt: null, displayLengthWorld: 104, displayWidthWorld: 30, calibrationStatus: 'unverified-configurable', capabilities: ladderCapabilities },
]

export const evolutionCatalog = [
  { id: 'jumpline', label: 'Jumpline', summary: '1¾-inch attack line with fog nozzle' },
  { id: 'skid-load', label: 'Skid Load', summary: '3-inch feeder, gated wye, and outlet-A attack line' },
  { id: 'high-rise-pack', label: 'High-Rise Pack', summary: 'Two 100-foot 1¾-inch sections with selectable nozzle' },
  { id: 'forward-lay', label: 'Forward Lay', summary: '5-inch supply from hydrant toward apparatus' },
  { id: 'reverse-lay', label: 'Reverse Lay', summary: '5-inch supply from apparatus toward hydrant' },
] as const

export type EvolutionId = (typeof evolutionCatalog)[number]['id']
