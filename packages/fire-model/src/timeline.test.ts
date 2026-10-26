import { describe, expect, it } from 'vitest'
import type { NoteObject, SceneObject, TimelineEntry } from '@mbfd/domain'
import { applyDiff, diffObjects, isEmptyDiff, sceneAt } from './timeline.js'

function note(id: string, text = id): NoteObject {
  return { id, type: 'note', text, x: 0, y: 0, rotation: 0, locked: false }
}

function entry(at: number, diff: Partial<Pick<TimelineEntry, 'upserts' | 'removes' | 'order'>>, kind: TimelineEntry['kind'] = 'change'): TimelineEntry {
  return { id: `entry-${at}`, at, kind, label: kind, ...diff }
}

describe('diffObjects', () => {
  const a = note('a')
  const b = note('b')
  const c = note('c')

  it('is empty when nothing changed', () => {
    const diff = diffObjects([a, b], [a, b])
    expect(diff).toEqual({ upserts: [], removes: [] })
    expect(isEmptyDiff(diff)).toBe(true)
  })

  it('detects changes by identity, not content', () => {
    const sameContent = { ...a }
    const diff = diffObjects([a, b], [sameContent, b])
    expect(diff.upserts).toEqual([sameContent])
    expect(diff.upserts[0]).toBe(sameContent)
    expect(isEmptyDiff(diff)).toBe(false)
  })

  it('reports additions and removals', () => {
    expect(diffObjects([a, b], [b, c])).toEqual({ upserts: [c], removes: ['a'] })
  })

  it('records the full order only when surviving objects were reordered', () => {
    const reordered = diffObjects([a, b, c], [c, a, b])
    expect(reordered).toEqual({ upserts: [], removes: [], order: ['c', 'a', 'b'] })
    expect(isEmptyDiff(reordered)).toBe(false)
    expect(diffObjects([a, b], [a, b, c])).not.toHaveProperty('order')
  })
})

describe('applyDiff', () => {
  const a = note('a')
  const b = note('b')
  const c = note('c')

  it('replaces in place, removes, and appends', () => {
    const editedB = note('b', 'edited')
    expect(applyDiff([a, b], { upserts: [editedB, c], removes: ['a'] })).toEqual([editedB, c])
  })

  it('applies a recorded order', () => {
    expect(applyDiff([a, b, c], { order: ['c', 'b', 'a'] }).map((object) => object.id)).toEqual(['c', 'b', 'a'])
  })

  it('sorts unknown ids to the end', () => {
    expect(applyDiff([a, b], { upserts: [c], order: ['b', 'a'] }).map((object) => object.id)).toEqual(['b', 'a', 'c'])
  })

  it('round-trips with diffObjects', () => {
    const before: SceneObject[] = [a, b, c]
    const after: SceneObject[] = [note('d'), c, note('a', 'changed')]
    expect(applyDiff(before, diffObjects(before, after))).toEqual(after)
  })

  it('does not mutate its input', () => {
    const objects = [a, b]
    applyDiff(objects, { removes: ['a'], order: ['b'] })
    expect(objects).toEqual([a, b])
  })
})

describe('sceneAt', () => {
  const a = note('a')
  const b = note('b')
  const entries = [
    entry(1000, { upserts: [b] }),
    entry(1500, {}, 'benchmark'),
    entry(2000, { removes: ['a'] }),
    entry(3000, { upserts: [note('c')], order: ['c', 'b'] }),
  ]

  it('replays entries up to and including the requested moment', () => {
    expect(sceneAt([a], entries, 0)).toEqual([a])
    expect(sceneAt([a], entries, 1000)).toEqual([a, b])
    expect(sceneAt([a], entries, 1999)).toEqual([a, b])
    expect(sceneAt([a], entries, 2500)).toEqual([b])
    expect(sceneAt([a], entries, 10_000).map((object) => object.id)).toEqual(['c', 'b'])
  })

  it('returns a copy of the base when no entry applies', () => {
    const base = [a]
    const scene = sceneAt(base, [], 5000)
    expect(scene).toEqual(base)
    expect(scene).not.toBe(base)
  })
})
