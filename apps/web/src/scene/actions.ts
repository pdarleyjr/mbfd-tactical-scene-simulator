import { apparatusCatalog, type FiregroundObject } from '@mbfd/domain'

export interface SceneActor {
  clientId: string
  name: string
  unit: string
}

function attribution(actor: SceneActor) {
  const now = new Date().toISOString()
  return {
    createdByClientId: actor.clientId,
    createdByName: actor.name,
    createdByUnit: actor.unit,
    createdAt: now,
    updatedAt: now,
  }
}

export function createApparatus(
  templateId: string,
  at: { x: number; y: number },
  actor: SceneActor,
): Extract<FiregroundObject, { type: 'apparatus' }> {
  const template = apparatusCatalog.find((candidate) => candidate.id === templateId)
  if (!template) throw new Error(`Unknown apparatus template: ${templateId}`)
  const isEngine = template.kind === 'engine'
  return {
    id: crypto.randomUUID(),
    type: 'apparatus',
    apparatusTemplateId: template.id,
    x: at.x,
    y: at.y,
    rotation: 0,
    scale: 1,
    status: 'positioned',
    locked: false,
    connectionPoints: isEngine ? [
      { id: 'intake-storz', label: '5-inch intake', coupling: 'storz-5', direction: 'inlet', x: 0, y: template.displayLengthWorld / 2 },
      { id: 'discharge-2.5', label: '2½-inch discharge', coupling: 'nh-2.5-male', direction: 'outlet', x: template.displayWidthWorld / 2, y: 0 },
      { id: 'discharge-1.5', label: '1½-inch discharge', coupling: 'nh-1.5-male', direction: 'outlet', x: -template.displayWidthWorld / 2, y: 0 },
    ] : [
      { id: 'intake-storz', label: '5-inch intake', coupling: 'storz-5', direction: 'inlet', x: 0, y: template.displayLengthWorld / 2 },
      { id: 'discharge-1.5', label: '1½-inch discharge', coupling: 'nh-1.5-male', direction: 'outlet', x: template.displayWidthWorld / 2, y: 0 },
    ],
    ...attribution(actor),
  }
}

export function createHydrant(
  at: { x: number; y: number },
  actor: SceneActor,
): Extract<FiregroundObject, { type: 'hydrant' }> {
  return {
    id: crypto.randomUUID(),
    type: 'hydrant',
    label: 'Hydrant',
    status: 'unknown',
    x: at.x,
    y: at.y,
    rotation: 0,
    locked: false,
    connectionPoints: [
      { id: 'storz', label: '5-inch connection', coupling: 'storz-5', direction: 'outlet', x: 0, y: 0 },
    ],
    ...attribution(actor),
  }
}

export function moveObject<T extends FiregroundObject>(
  object: T,
  position: { x: number; y: number },
  clientId: string,
): T {
  return {
    ...object,
    x: position.x,
    y: position.y,
    updatedByClientId: clientId,
    updatedAt: new Date().toISOString(),
  }
}
