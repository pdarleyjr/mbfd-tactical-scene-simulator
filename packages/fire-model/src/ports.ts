import { findApparatusTemplate, type ApparatusTemplateId, type Calibration, type PortDefinition, type SceneObject } from '@mbfd/domain'
import { localToWorld, type Vec } from './geometry.js'

/** The parts of a scenario that change how objects are sized on the map. */
export interface SceneContext {
  calibration?: Calibration | undefined
  apparatusLengthFt?: Partial<Record<ApparatusTemplateId, number>> | undefined
}

export interface ApparatusSize {
  length: number
  width: number
  /** True only when a calibrated map and an operator-entered length are both present. */
  toScale: boolean
}

export function apparatusSize(templateId: string, context: SceneContext = {}): ApparatusSize {
  const template = findApparatusTemplate(templateId)
  if (!template) return { length: 74, width: 20, toScale: false }
  const lengthFt = context.apparatusLengthFt?.[template.id]
  const feetPerUnit = context.calibration?.feetPerWorldUnit
  const length = lengthFt && feetPerUnit ? lengthFt / feetPerUnit : template.defaultLengthWorld
  return { length, width: length * template.imageAspect, toScale: Boolean(lengthFt && feetPerUnit) }
}

/**
 * Connection points. Positions are schematic (pump-panel discharges, rear
 * intake) and carried over from V2; they are not verified MBFD plumbing.
 */
export function portsFor(object: SceneObject, context: SceneContext = {}): PortDefinition[] {
  switch (object.type) {
    case 'apparatus': {
      const template = findApparatusTemplate(object.templateId)
      const { length, width } = apparatusSize(object.templateId, context)
      const intake: PortDefinition = { id: 'intake', label: '5″ intake', size: 'storz-5', direction: 'inlet', x: 0, y: length / 2 - 2 }
      if (template?.kind === 'aerial') {
        return [intake, { id: 'discharge-1.5', label: '1½″ discharge', size: 'nh-1.5', direction: 'outlet', x: width / 2, y: 0 }]
      }
      return [
        intake,
        { id: 'discharge-2.5', label: '2½″ discharge', size: 'nh-2.5', direction: 'outlet', x: width / 2, y: -length * 0.21 },
        { id: 'discharge-1.5', label: '1½″ discharge', size: 'nh-1.5', direction: 'outlet', x: -width / 2, y: -length * 0.21 },
      ]
    }
    case 'hydrant':
      return [{ id: 'storz', label: '5″ steamer', size: 'storz-5', direction: 'outlet', x: 0, y: 0 }]
    case 'appliance':
      return [
        { id: 'inlet', label: '2½″ inlet', size: 'nh-2.5', direction: 'inlet', x: 0, y: 10 },
        { id: 'outlet-a', label: 'Outlet A', size: 'nh-1.5', direction: 'outlet', x: -8, y: -9 },
        { id: 'outlet-b', label: 'Outlet B', size: 'nh-1.5', direction: 'outlet', x: 8, y: -9 },
      ]
    case 'nozzle':
      return [{ id: 'inlet', label: 'Nozzle inlet', size: 'nh-1.5', direction: 'inlet', x: 0, y: 6 }]
    default:
      return []
  }
}

export function portWorldPosition(object: SceneObject, port: PortDefinition): Vec {
  if (!('x' in object)) return { x: port.x, y: port.y }
  return localToWorld(object, port)
}

export function findPort(object: SceneObject, portId: string, context: SceneContext = {}): PortDefinition | undefined {
  return portsFor(object, context).find((port) => port.id === portId)
}
