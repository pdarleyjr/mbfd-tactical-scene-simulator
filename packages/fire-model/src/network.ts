import { hoseCatalog, type Calibration, type HoseLoads, type HoseObject, type SceneObject } from '@mbfd/domain'
import { readHose } from './measure.js'

/**
 * Connectivity, not hydraulics. A line is "hydrant" when an unbroken chain of
 * connections reaches it from a hydrant, "tank" when it leaves an apparatus
 * that has no supply, and "dry" otherwise. No pressure, flow, or friction loss
 * is modelled.
 */
export type LineState = 'hydrant' | 'tank' | 'dry'

export interface ApparatusSupply {
  supplied: boolean
  hydrantIds: string[]
  supplyLineIds: string[]
  outputLineIds: string[]
}

export interface SupplyIssue {
  id: string
  severity: 'warning' | 'info'
  objectId: string
  message: string
}

export interface WaterSupplyReport {
  lines: Map<string, LineState>
  apparatus: Map<string, ApparatusSupply>
  issues: SupplyIssue[]
}

export function objectName(object: SceneObject | undefined): string {
  if (!object) return 'unknown'
  switch (object.type) {
    case 'apparatus': return object.label
    case 'hydrant': return object.label
    case 'appliance': return 'gated wye'
    case 'nozzle': return object.nozzleType === 'fog' ? 'fog nozzle' : 'smooth-bore nozzle'
    default: return object.type
  }
}

export function describeHose(hose: HoseObject, index: Map<string, SceneObject>): string {
  const from = hose.from ? objectName(index.get(hose.from.objectId)) : 'open end'
  const to = hose.to ? objectName(index.get(hose.to.objectId)) : 'open end'
  return `${hoseCatalog[hose.hoseType].shortLabel} ${hose.purpose} (${from} → ${to})`
}

export function analyzeWaterSupply(objects: readonly SceneObject[], options: { loads?: HoseLoads; calibration?: Calibration | undefined } = {}): WaterSupplyReport {
  const index = new Map(objects.map((object) => [object.id, object]))
  const hoses = objects.filter((object): object is HoseObject => object.type === 'hose')
  const outgoing = new Map<string, HoseObject[]>()
  for (const hose of hoses) {
    if (!hose.from) continue
    const list = outgoing.get(hose.from.objectId) ?? []
    list.push(hose)
    outgoing.set(hose.from.objectId, list)
  }
  const lines = new Map<string, LineState>()
  const apparatus = new Map<string, ApparatusSupply>()
  for (const object of objects) {
    if (object.type === 'apparatus') apparatus.set(object.id, { supplied: false, hydrantIds: [], supplyLineIds: [], outputLineIds: (outgoing.get(object.id) ?? []).map((hose) => hose.id) })
  }

  // Hydrant pass: breadth-first through hoses, appliances, and pumping apparatus.
  const queue: Array<{ objectId: string; hydrantId: string }> = []
  for (const object of objects) {
    if (object.type === 'hydrant' && object.status !== 'out-of-service') queue.push({ objectId: object.id, hydrantId: object.id })
  }
  const visited = new Set<string>()
  while (queue.length) {
    const { objectId, hydrantId } = queue.shift()!
    const visitKey = `${objectId}:${hydrantId}`
    if (visited.has(visitKey)) continue
    visited.add(visitKey)
    for (const hose of outgoing.get(objectId) ?? []) {
      lines.set(hose.id, 'hydrant')
      if (!hose.to) continue
      const target = index.get(hose.to.objectId)
      if (!target) continue
      if (target.type === 'apparatus') {
        const supply = apparatus.get(target.id)!
        supply.supplied = true
        if (!supply.hydrantIds.includes(hydrantId)) supply.hydrantIds.push(hydrantId)
        if (!supply.supplyLineIds.includes(hose.id)) supply.supplyLineIds.push(hose.id)
        queue.push({ objectId: target.id, hydrantId })
      } else if (target.type === 'appliance') {
        queue.push({ objectId: target.id, hydrantId })
      }
    }
  }

  // Tank pass: apparatus without supply still flow from their own tanks.
  const tankQueue: string[] = []
  for (const [id, supply] of apparatus) if (!supply.supplied) tankQueue.push(id)
  while (tankQueue.length) {
    const objectId = tankQueue.shift()!
    for (const hose of outgoing.get(objectId) ?? []) {
      if (lines.has(hose.id)) continue
      lines.set(hose.id, 'tank')
      const target = hose.to ? index.get(hose.to.objectId) : undefined
      if (target?.type === 'appliance') tankQueue.push(target.id)
    }
  }
  for (const hose of hoses) if (!lines.has(hose.id)) lines.set(hose.id, 'dry')

  const issues: SupplyIssue[] = []
  for (const hose of hoses) {
    const name = describeHose(hose, index)
    const target = hose.to ? index.get(hose.to.objectId) : undefined
    if (!hose.from && !hose.to) issues.push({ id: `${hose.id}:loose`, severity: 'info', objectId: hose.id, message: `${hoseCatalog[hose.hoseType].label} is not connected at either end.` })
    else if (!hose.from) issues.push({ id: `${hose.id}:source`, severity: 'warning', objectId: hose.id, message: `${name} has no water source attached.` })
    else if (!hose.to && hose.purpose === 'attack') issues.push({ id: `${hose.id}:nozzle`, severity: 'warning', objectId: hose.id, message: `${name} has no nozzle at the end.` })
    else if (!hose.to) issues.push({ id: `${hose.id}:open`, severity: 'warning', objectId: hose.id, message: `${name} has an open end.` })
    if (target?.type === 'appliance' && hose.purpose === 'attack') issues.push({ id: `${hose.id}:wye`, severity: 'info', objectId: hose.id, message: `${name} ends at a wye rather than a nozzle.` })
    if (options.loads) {
      const reading = readHose(hose, options.loads, options.calibration)
      if (reading.overLoadFt !== undefined) issues.push({ id: `${hose.id}:load`, severity: 'warning', objectId: hose.id, message: `${name} needs ${Math.round(reading.length.feet!)} ft but the configured load is ${reading.loadFt} ft.` })
    }
  }
  for (const object of objects) {
    if (object.type === 'hydrant' && object.status === 'out-of-service' && (outgoing.get(object.id)?.length ?? 0) > 0) {
      issues.push({ id: `${object.id}:oos`, severity: 'warning', objectId: object.id, message: `${object.label} is marked out of service but has a line attached.` })
    }
    if (object.type === 'apparatus') {
      const supply = apparatus.get(object.id)!
      if (!supply.supplied && supply.outputLineIds.length) issues.push({ id: `${object.id}:tank`, severity: 'info', objectId: object.id, message: `${object.label} is flowing tank water only — no supply line is connected.` })
    }
  }
  return { lines, apparatus, issues }
}
