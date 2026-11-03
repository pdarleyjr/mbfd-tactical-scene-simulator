import type { PathObject, SceneObject } from '@mbfd/domain'
import { pointAt, pointCount } from '@mbfd/fire-model'
import { useBoard } from '../store/board'

/** Bend edits shared by the on-map handles and the inspector. */

/** Removes one bend from a line (never an end). Exported for the inspector. */
export function removeBend(objectId: string, index: number) {
  const object = useBoard.getState().board.objects.find((candidate) => candidate.id === objectId)
  if (!object || !('points' in object)) return
  const count = pointCount(object.points)
  if (count <= 2 || index <= 0 || index >= count - 1) return
  useBoard.getState().commit((objects) => objects.map((candidate) => {
    if (candidate.id !== objectId) return candidate
    const points = [...(candidate as PathObject).points]
    points.splice(index * 2, 2)
    return { ...candidate, points } as SceneObject
  }), 'Remove bend')
}

/** Adds a bend halfway along a segment. */
export function addBendAt(objectId: string, segment: number) {
  useBoard.getState().commit((objects) => objects.map((candidate) => {
    if (candidate.id !== objectId || !('points' in candidate)) return candidate
    const a = pointAt(candidate.points, segment)
    const b = pointAt(candidate.points, segment + 1)
    const points = [...candidate.points]
    points.splice((segment + 1) * 2, 0, (a.x + b.x) / 2, (a.y + b.y) / 2)
    return { ...candidate, points } as SceneObject
  }), 'Add bend')
}
