import type { ConnectionPoint, FiregroundObject } from '@mbfd/domain'

interface CouplingLike {
  coupling: ConnectionPoint['coupling']
}

const complementaryCouplings = new Set([
  'nh-1.5-female:nh-1.5-male',
  'nh-1.5-male:nh-1.5-female',
  'nh-2.5-female:nh-2.5-male',
  'nh-2.5-male:nh-2.5-female',
  'storz-5:storz-5',
])

export function canConnect(source: CouplingLike, target: CouplingLike): boolean {
  return complementaryCouplings.has(`${source.coupling}:${target.coupling}`)
}

export function findAvailableCompatiblePort(
  object: FiregroundObject,
  coupling: ConnectionPoint['coupling'],
): ConnectionPoint | undefined {
  if (!('connectionPoints' in object)) return undefined
  return object.connectionPoints.find((port) => !port.occupiedBy && canConnect({ coupling }, port))
}

export function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}
