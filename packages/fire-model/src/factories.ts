import {
  findApparatusTemplate,
  findMarker,
  type ApparatusObject,
  type ApplianceObject,
  type HydrantObject,
  type MarkerObject,
  type MarkerType,
  type NoteObject,
  type NozzleObject,
  type SceneObject,
} from '@mbfd/domain'
import { translatePoints } from './geometry.js'

export function newId(): string {
  return crypto.randomUUID()
}

/** First unused label in the sequence E1, E1-2, E1-3 … */
export function nextApparatusLabel(templateId: string, objects: readonly SceneObject[]): string {
  const used = new Set(objects.filter((object): object is ApparatusObject => object.type === 'apparatus').map((object) => object.label.toUpperCase()))
  if (!used.has(templateId.toUpperCase())) return templateId
  for (let count = 2; ; count += 1) if (!used.has(`${templateId}-${count}`.toUpperCase())) return `${templateId}-${count}`
}

export function nextHydrantLabel(objects: readonly SceneObject[]): string {
  const used = new Set(objects.filter((object): object is HydrantObject => object.type === 'hydrant').map((object) => object.label.toUpperCase()))
  for (let count = 1; ; count += 1) if (!used.has(`H${count}`)) return `H${count}`
}

export function createApparatus(templateId: string, at: { x: number; y: number }, rotation: number, objects: readonly SceneObject[]): ApparatusObject {
  const template = findApparatusTemplate(templateId)
  if (!template) throw new Error(`Unknown apparatus ${templateId}`)
  return { id: newId(), type: 'apparatus', templateId: template.id, label: nextApparatusLabel(template.id, objects), assignment: '', x: at.x, y: at.y, rotation, locked: false }
}

export function createHydrant(at: { x: number; y: number }, objects: readonly SceneObject[]): HydrantObject {
  return { id: newId(), type: 'hydrant', label: nextHydrantLabel(objects), status: 'unknown', notes: '', x: at.x, y: at.y, rotation: 0, locked: false }
}

export function createMarker(markerType: MarkerType, at: { x: number; y: number }): MarkerObject {
  const marker = findMarker(markerType)
  return { id: newId(), type: 'marker', markerType, label: '', x: at.x, y: at.y, rotation: 0, locked: false, ...(marker?.area ? { radius: 90 } : {}) }
}

export function createNote(at: { x: number; y: number }, text = 'Note'): NoteObject {
  return { id: newId(), type: 'note', text, x: at.x, y: at.y, rotation: 0, locked: false }
}

export function createWye(at: { x: number; y: number }, rotation: number): ApplianceObject {
  return { id: newId(), type: 'appliance', applianceType: 'gated-wye', x: at.x, y: at.y, rotation, locked: false }
}

export function createNozzle(at: { x: number; y: number }, rotation: number, nozzleType: NozzleObject['nozzleType'] = 'fog'): NozzleObject {
  return { id: newId(), type: 'nozzle', nozzleType, x: at.x, y: at.y, rotation, locked: false }
}

/** Moves any object by a world offset, preserving everything else. */
export function translateObject<T extends SceneObject>(object: T, dx: number, dy: number): T {
  if ('points' in object) return { ...object, points: translatePoints(object.points, dx, dy) }
  return { ...object, x: object.x + dx, y: object.y + dy }
}

/**
 * Copies a set of objects with fresh ids, keeping connections that stay
 * inside the copied set and releasing the rest.
 */
export function duplicateObjects(selection: readonly SceneObject[], all: readonly SceneObject[], offset = { x: 24, y: 24 }): SceneObject[] {
  const idMap = new Map(selection.map((object) => [object.id, newId()]))
  const placed: SceneObject[] = [...all]
  return selection.map((object) => {
    const moved = translateObject(object, offset.x, offset.y)
    let copy: SceneObject = { ...moved, id: idMap.get(object.id)! }
    if (copy.type === 'apparatus') copy = { ...copy, label: nextApparatusLabel(copy.templateId, placed) }
    if (copy.type === 'hydrant') copy = { ...copy, label: nextHydrantLabel(placed) }
    if (copy.type === 'hose') {
      const { from, to, ...rest } = copy
      const mappedFrom = from && idMap.has(from.objectId) ? { objectId: idMap.get(from.objectId)!, portId: from.portId } : undefined
      const mappedTo = to && idMap.has(to.objectId) ? { objectId: idMap.get(to.objectId)!, portId: to.portId } : undefined
      copy = { ...rest, ...(mappedFrom ? { from: mappedFrom } : {}), ...(mappedTo ? { to: mappedTo } : {}) }
    }
    placed.push(copy)
    return copy
  })
}
