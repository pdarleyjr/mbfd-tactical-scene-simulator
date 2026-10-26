import { apparatusModels, findApparatusTemplate, type ApparatusModel, type ApparatusTemplateId, type Calibration, type PortDefinition, type SceneObject } from '@mbfd/domain'
import { localToWorld, type Vec } from './geometry.js'

/** The parts of a scenario that change how objects are sized on the map. */
export interface SceneContext {
  calibration?: Calibration | undefined
  /** Legacy per-scenario overrides; the model's published length wins otherwise. */
  apparatusLengthFt?: Partial<Record<ApparatusTemplateId, number>> | undefined
}

export interface ApparatusSize {
  length: number
  width: number
  /** World units per foot along the vehicle, for placing ports by feet. */
  unitsPerFt: number
  /** True when the map is calibrated, so the vehicle is drawn at real length. */
  toScale: boolean
}

/** Drawing scale for maps that have not been calibrated yet. */
const UNCALIBRATED_UNITS_PER_FT = 2.25

export function apparatusModelFor(templateId: string, modelId?: string): ApparatusModel {
  const template = findApparatusTemplate(templateId)
  const chosen = modelId && modelId in apparatusModels ? apparatusModels[modelId as keyof typeof apparatusModels] : undefined
  return chosen ?? apparatusModels[template?.model ?? 'pierce-puc']
}

export function apparatusSize(templateId: string, context: SceneContext = {}, modelId?: string): ApparatusSize {
  const template = findApparatusTemplate(templateId)
  const model = apparatusModelFor(templateId, modelId)
  const lengthFt = context.apparatusLengthFt?.[template?.id ?? 'E1'] ?? model.lengthFt
  const feetPerUnit = context.calibration?.feetPerWorldUnit
  const unitsPerFt = feetPerUnit ? 1 / feetPerUnit : UNCALIBRATED_UNITS_PER_FT
  const length = lengthFt * unitsPerFt
  return { length, width: length * (template?.imageAspect ?? 0.26), unitsPerFt, toScale: Boolean(feetPerUnit) }
}

/**
 * Connection points. The 5″ intake is on the driver's side (left when the
 * vehicle faces up) at the model's published distance from the front bumper.
 * Discharges sit at the pump panel beside it; rescues have no pump.
 */
export function portsFor(object: SceneObject, context: SceneContext = {}): PortDefinition[] {
  switch (object.type) {
    case 'apparatus': {
      const model = apparatusModelFor(object.templateId, object.modelId)
      if (!model.pump || model.intakeFromFrontFt === null) return []
      const { length, width, unitsPerFt } = apparatusSize(object.templateId, context, object.modelId)
      const panel = -length / 2 + model.intakeFromFrontFt * unitsPerFt
      return [
        { id: 'intake', label: '5″ intake (driver side)', size: 'storz-5', direction: 'inlet', x: -width / 2, y: panel },
        { id: 'discharge-1.5', label: '1¾″ preconnect (driver side)', size: 'nh-1.5', direction: 'outlet', x: -width / 2, y: panel - 4 * unitsPerFt },
        { id: 'discharge-1.5b', label: '1¾″ preconnect (officer side)', size: 'nh-1.5', direction: 'outlet', x: width / 2, y: panel - 4 * unitsPerFt },
        { id: 'discharge-2.5', label: '2½″ discharge (officer side)', size: 'nh-2.5', direction: 'outlet', x: width / 2, y: panel },
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

/** Whether a world point lands on an object's body (with a forgiving margin). */
export function hitsObject(object: SceneObject, point: Vec, context: SceneContext, margin: number): boolean {
  if (object.type === 'apparatus') {
    const { length, width } = apparatusSize(object.templateId, context, object.modelId)
    const radians = -object.rotation * Math.PI / 180
    const dx = point.x - object.x
    const dy = point.y - object.y
    const localX = dx * Math.cos(radians) - dy * Math.sin(radians)
    const localY = dx * Math.sin(radians) + dy * Math.cos(radians)
    return Math.abs(localX) <= width / 2 + margin && Math.abs(localY) <= length / 2 + margin
  }
  if (object.type === 'hydrant' || object.type === 'appliance' || object.type === 'nozzle') {
    return Math.hypot(point.x - object.x, point.y - object.y) <= 14 + margin
  }
  return false
}
