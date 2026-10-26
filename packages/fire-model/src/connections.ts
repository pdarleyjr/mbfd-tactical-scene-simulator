import { hoseCatalog, type HoseObject, type HoseType, type PortDefinition, type PortDirection, type PortRef, type SceneObject } from '@mbfd/domain'
import { distance, reversePoints, type Vec } from './geometry.js'
import { hitsObject, portsFor, portWorldPosition, type SceneContext } from './ports.js'

export function portKey(reference: PortRef): string {
  return `${reference.objectId}:${reference.portId}`
}

export function occupiedPorts(objects: readonly SceneObject[], excludeHoseId?: string): Set<string> {
  const occupied = new Set<string>()
  for (const object of objects) {
    if (object.type !== 'hose' || object.id === excludeHoseId) continue
    if (object.from) occupied.add(portKey(object.from))
    if (object.to) occupied.add(portKey(object.to))
  }
  return occupied
}

/**
 * A hose end may attach to a port of the matching coupling size. When the
 * other end is already attached, the two ports must face opposite ways: water
 * leaves an outlet and enters an inlet.
 */
export function canAttach(hoseType: HoseType, port: PortDefinition, otherEndDirection?: PortDirection): boolean {
  if (hoseCatalog[hoseType].portSize !== port.size) return false
  return !otherEndDirection || otherEndDirection !== port.direction
}

export interface SnapTarget {
  objectId: string
  portId: string
  port: PortDefinition
  object: SceneObject
  x: number
  y: number
  distance: number
}

export interface SnapRequest {
  hoseType: HoseType
  point: Vec
  radius: number
  context?: SceneContext
  otherEndDirection?: PortDirection | undefined
  excludeHoseId?: string | undefined
  accept?: (object: SceneObject, port: PortDefinition) => boolean
  /** When set, a point on an object's body snaps to its nearest fitting port. */
  bodyMargin?: number | undefined
}

export function findSnapTarget(objects: readonly SceneObject[], request: SnapRequest): SnapTarget | undefined {
  const occupied = occupiedPorts(objects, request.excludeHoseId)
  let best: SnapTarget | undefined
  let onBody: SnapTarget | undefined
  for (const object of objects) {
    const body = request.bodyMargin !== undefined && hitsObject(object, request.point, request.context ?? {}, request.bodyMargin)
    for (const port of portsFor(object, request.context)) {
      if (occupied.has(`${object.id}:${port.id}`)) continue
      if (!canAttach(request.hoseType, port, request.otherEndDirection)) continue
      if (request.accept && !request.accept(object, port)) continue
      const position = portWorldPosition(object, port)
      const gap = distance(position, request.point)
      const target = { objectId: object.id, portId: port.id, port, object, ...position, distance: gap }
      if (gap <= request.radius && (!best || gap < best.distance)) best = target
      // Tapping anywhere on a truck or hydrant means "connect here": take its nearest fitting port.
      if (body && (!onBody || gap < onBody.distance)) onBody = target
    }
  }
  return best ?? onBody
}

/** Every unoccupied port a given hose end could attach to, for highlighting. */
export function eligiblePorts(objects: readonly SceneObject[], request: Omit<SnapRequest, 'point' | 'radius'>): SnapTarget[] {
  const occupied = occupiedPorts(objects, request.excludeHoseId)
  const targets: SnapTarget[] = []
  for (const object of objects) {
    for (const port of portsFor(object, request.context)) {
      if (occupied.has(`${object.id}:${port.id}`) || !canAttach(request.hoseType, port, request.otherEndDirection)) continue
      if (request.accept && !request.accept(object, port)) continue
      targets.push({ objectId: object.id, portId: port.id, port, object, ...portWorldPosition(object, port), distance: 0 })
    }
  }
  return targets
}

function resolve(reference: PortRef | undefined, index: Map<string, SceneObject>, hoseType: HoseType, context: SceneContext) {
  if (!reference) return undefined
  const object = index.get(reference.objectId)
  if (!object) return undefined
  const port = portsFor(object, context).find((candidate) => candidate.id === reference.portId)
  if (!port || hoseCatalog[hoseType].portSize !== port.size) return undefined
  return { reference, object, port, position: portWorldPosition(object, port) }
}

/**
 * Keeps hose geometry truthful: attached ends sit exactly on their ports,
 * references to deleted objects are released, and connected hoses run from
 * the outlet (source) end to the inlet end. Returns the same array instance
 * when nothing needed to change.
 */
export function reconcileHoses(objects: readonly SceneObject[], context: SceneContext = {}): SceneObject[] {
  const index = new Map(objects.map((object) => [object.id, object]))
  let changed = false
  const next = objects.map((object) => {
    if (object.type !== 'hose') return object
    const reconciled = reconcileHose(object, index, context)
    if (reconciled !== object) changed = true
    return reconciled
  })
  return changed ? next : objects as SceneObject[]
}

export function reconcileHose(hose: HoseObject, index: Map<string, SceneObject>, context: SceneContext = {}): HoseObject {
  let from = resolve(hose.from, index, hose.hoseType, context)
  let to = resolve(hose.to, index, hose.hoseType, context)
  let points = hose.points
  let reversed = false
  // Orient for flow: an inlet belongs at the far end, an outlet at the start.
  if ((from && from.port.direction === 'inlet' && (!to || to.port.direction === 'outlet')) || (!from && to && to.port.direction === 'outlet')) {
    ;[from, to] = [to, from]
    points = reversePoints(points)
    reversed = true
  }
  const last = points.length - 2
  let moved = false
  if (from && (Math.abs(points[0]! - from.position.x) > 1e-6 || Math.abs(points[1]! - from.position.y) > 1e-6)) {
    points = [...points]; points[0] = from.position.x; points[1] = from.position.y; moved = true
  }
  if (to && (Math.abs(points[last]! - to.position.x) > 1e-6 || Math.abs(points[last + 1]! - to.position.y) > 1e-6)) {
    if (!moved) points = [...points]
    points[last] = to.position.x; points[last + 1] = to.position.y; moved = true
  }
  const fromChanged = (hose.from ? portKey(hose.from) : '') !== (from ? portKey(from.reference) : '')
  const toChanged = (hose.to ? portKey(hose.to) : '') !== (to ? portKey(to.reference) : '')
  if (!moved && !reversed && !fromChanged && !toChanged) return hose
  const { from: _from, to: _to, ...rest } = hose
  return { ...rest, points, ...(from ? { from: from.reference } : {}), ...(to ? { to: to.reference } : {}) }
}
