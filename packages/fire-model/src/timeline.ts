import type { SceneObject, TimelineEntry } from '@mbfd/domain'

export interface SceneDiff {
  upserts: SceneObject[]
  removes: string[]
  /** Present only when the stacking order of surviving objects changed. */
  order?: string[]
}

/**
 * Objects are immutable, so identity comparison is enough to find what a
 * commit changed. This keeps the review timeline compact.
 */
export function diffObjects(previous: readonly SceneObject[], next: readonly SceneObject[]): SceneDiff {
  const before = new Map(previous.map((object) => [object.id, object]))
  const after = new Set(next.map((object) => object.id))
  const upserts = next.filter((object) => before.get(object.id) !== object)
  const removes = previous.filter((object) => !after.has(object.id)).map((object) => object.id)
  const survivingBefore = previous.filter((object) => after.has(object.id)).map((object) => object.id)
  const survivingAfter = next.filter((object) => before.has(object.id)).map((object) => object.id)
  const reordered = survivingBefore.some((id, index) => survivingAfter[index] !== id)
  return reordered ? { upserts, removes, order: next.map((object) => object.id) } : { upserts, removes }
}

export function isEmptyDiff(diff: SceneDiff): boolean {
  return !diff.upserts.length && !diff.removes.length && !diff.order
}

export function applyDiff(objects: readonly SceneObject[], diff: Pick<TimelineEntry, 'upserts' | 'removes' | 'order'>): SceneObject[] {
  const removed = new Set(diff.removes ?? [])
  const upserts = new Map((diff.upserts ?? []).map((object) => [object.id, object]))
  const result: SceneObject[] = []
  for (const object of objects) {
    if (removed.has(object.id)) continue
    const replacement = upserts.get(object.id)
    result.push(replacement ?? object)
    upserts.delete(object.id)
  }
  result.push(...upserts.values())
  if (!diff.order) return result
  const position = new Map(diff.order.map((id, index) => [id, index]))
  return result.sort((a, b) => (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER))
}

/** Reconstructs the scene as it stood at a moment of a recorded run. */
export function sceneAt(base: readonly SceneObject[], entries: readonly TimelineEntry[], atMs: number): SceneObject[] {
  let objects: SceneObject[] = [...base]
  for (const entry of entries) {
    if (entry.at > atMs) break
    if (entry.upserts || entry.removes || entry.order) objects = applyDiff(objects, entry)
  }
  return objects
}
