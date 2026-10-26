import { type EvolutionId, type SceneObject } from '@mbfd/domain'
import { duplicateObjects, evolutionSteps, findPort, normalizeDegrees, portWorldPosition, translateObject } from '@mbfd/fire-model'
import { sceneContext, useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { offerUndo } from './undo'

/** Selection commands shared by keyboard shortcuts and the inspector. */

function selectedIds() {
  return new Set(useUi.getState().selection)
}

export function deleteSelection() {
  const ids = selectedIds()
  if (!ids.size) return
  const count = ids.size
  useBoard.getState().commit((objects) => objects.filter((object) => !ids.has(object.id)), count > 1 ? `Delete ${count} objects` : 'Delete')
  useUi.getState().select([])
  offerUndo(count > 1 ? `Deleted ${count} objects.` : 'Deleted.')
}

export function duplicateSelection(offset = { x: 26, y: 26 }) {
  const ids = selectedIds()
  const objects = useBoard.getState().board.objects
  const selection = objects.filter((object) => ids.has(object.id))
  if (!selection.length) return
  const copies = duplicateObjects(selection, objects, offset)
  useBoard.getState().commit([...objects, ...copies], copies.length > 1 ? `Duplicate ${copies.length} objects` : 'Duplicate')
  useUi.getState().select(copies.map((copy) => copy.id))
}

let clipboard: SceneObject[] = []

export function copySelection() {
  const ids = selectedIds()
  clipboard = useBoard.getState().board.objects.filter((object) => ids.has(object.id))
  if (clipboard.length) useUi.getState().toast(`Copied ${clipboard.length} object${clipboard.length > 1 ? 's' : ''}.`, 'info')
}

export function pasteClipboard() {
  if (!clipboard.length) return
  const objects = useBoard.getState().board.objects
  const copies = duplicateObjects(clipboard, objects, { x: 40, y: 40 })
  clipboard = copies
  useBoard.getState().commit([...objects, ...copies], 'Paste')
  useUi.getState().setTool('select')
  useUi.getState().select(copies.map((copy) => copy.id))
}

export function nudgeSelection(dx: number, dy: number) {
  const ids = selectedIds()
  if (!ids.size) return
  useBoard.getState().commit((objects) => objects.map((object) => ids.has(object.id) && !object.locked ? translateObject(object, dx, dy) : object), 'Nudge')
}

export function rotateSelection(delta: number) {
  const ids = selectedIds()
  if (!ids.size) return
  useBoard.getState().commit((objects) => objects.map((object) => {
    if (!ids.has(object.id) || object.locked || !('rotation' in object) || object.type === 'hydrant' || object.type === 'marker' || object.type === 'note') return object
    const rotation = normalizeDegrees(object.rotation + delta)
    if (object.type === 'apparatus') useUi.getState().rememberRotation(object.templateId, rotation)
    return { ...object, rotation }
  }), 'Rotate')
}

export function setRotation(id: string, rotation: number) {
  useBoard.getState().commit((objects) => objects.map((object) => {
    if (object.id !== id || !('rotation' in object)) return object
    const value = normalizeDegrees(rotation)
    if (object.type === 'apparatus') useUi.getState().rememberRotation(object.templateId, value)
    return { ...object, rotation: value }
  }), 'Rotate')
}

export function toggleLockSelection() {
  const ids = selectedIds()
  const objects = useBoard.getState().board.objects
  const targets = objects.filter((object) => ids.has(object.id))
  if (!targets.length) return
  const lock = targets.some((object) => !object.locked)
  useBoard.getState().commit(objects.map((object) => ids.has(object.id) ? { ...object, locked: lock } : object), lock ? 'Lock' : 'Unlock')
}

export function reorderSelection(direction: 'front' | 'back') {
  const ids = selectedIds()
  useBoard.getState().commit((objects) => {
    const chosen = objects.filter((object) => ids.has(object.id))
    const rest = objects.filter((object) => !ids.has(object.id))
    return direction === 'front' ? [...rest, ...chosen] : [...chosen, ...rest]
  }, direction === 'front' ? 'Bring to front' : 'Send to back')
}

export function updateObject<T extends SceneObject>(id: string, patch: Partial<T>, label: string) {
  useBoard.getState().commit((objects) => objects.map((object) => object.id === id ? { ...object, ...patch } as SceneObject : object), label)
}

export function selectAll() {
  useUi.getState().setTool('select')
  useUi.getState().select(useBoard.getState().board.objects.map((object) => object.id))
}

/** Starts a packaged evolution already attached to a specific port. */
export function startEvolutionFrom(evolutionId: EvolutionId, objectId: string, portId: string, nozzle: 'fog' | 'smooth-bore' = 'fog') {
  const { board } = useBoard.getState()
  const object = board.objects.find((candidate) => candidate.id === objectId)
  if (!object) return
  const port = findPort(object, portId, sceneContext(board.scenario))
  if (!port) return
  const ui = useUi.getState()
  ui.setHoseChoice({ kind: 'evolution', evolutionId, nozzle })
  const start = portWorldPosition(object, port)
  const steps = evolutionSteps(evolutionId, board.scenario.hoseLoads)
  useUi.getState().setDraft({ kind: 'hose', points: [start.x, start.y], from: { objectId, portId }, steps, stepIndex: 0, evolutionId })
  ui.toast(steps[0]!.prompt.route, 'info')
}

export function disconnectHoseEnd(hoseId: string, end: 'from' | 'to') {
  useBoard.getState().commit((objects) => objects.map((object) => {
    if (object.id !== hoseId || object.type !== 'hose') return object
    const { [end]: _released, ...rest } = object
    return rest as SceneObject
  }), 'Disconnect line')
}
