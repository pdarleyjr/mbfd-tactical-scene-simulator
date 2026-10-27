import { describe, expect, it } from 'vitest'
import { applyScenePatch, clientMessageSchema, diffBoards, isEmptyPatch, newSceneId, scenarioKey, sceneIdSchema, withoutPendingChanges } from './sync.js'
import type { Board, SceneObject } from './scene.js'

const note = (id: string, x = 0, text = id): SceneObject => ({ id, type: 'note', x, y: 0, rotation: 0, text, locked: false })

function board(objects: SceneObject[] = []): Board {
  return {
    schemaVersion: 3,
    id: 'b1',
    name: 'Drill',
    templateId: null,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    scenario: {
      title: 'Drill', description: '', dispatch: '', background: { kind: 'builtin', url: '/map.webp' }, world: { width: 1000, height: 800 },
      northDegrees: 0, weather: { windFromDegrees: 0, windMph: 0, temperatureF: 80, conditions: '' }, injects: [], benchmarks: [],
    },
    objects,
    training: { timer: { running: false, startedAt: null, accumulatedMs: 0 }, revealed: {}, completed: {}, notes: '' },
    snapshots: [],
    run: null,
  } as unknown as Board
}

describe('scene ids', () => {
  it('accepts short lowercase ids and the main scene', () => {
    expect(sceneIdSchema.safeParse('main').success).toBe(true)
    expect(sceneIdSchema.safeParse('ab12cd34').success).toBe(true)
    expect(sceneIdSchema.safeParse('AB12').success).toBe(false)
    expect(sceneIdSchema.safeParse('../x').success).toBe(false)
    expect(sceneIdSchema.safeParse('abc').success).toBe(false)
  })

  it('creates valid ids without look-alike characters', () => {
    let seed = 0
    const id = newSceneId(() => (seed = (seed + 0.137) % 1))
    expect(id).toMatch(/^[a-z0-9]{8}$/)
    expect(id).not.toMatch(/[il01o]/)
    expect(sceneIdSchema.safeParse(newSceneId()).success).toBe(true)
  })
})

describe('applyScenePatch', () => {
  it('updates, adds, and removes objects without touching the original', () => {
    const start = board([note('a'), note('b'), note('c')])
    const next = applyScenePatch(start, { upserts: [note('b', 50), note('d')], removes: ['c'] })
    expect(next.objects.map((object) => object.id)).toEqual(['a', 'b', 'd'])
    expect(next.objects[1]).toMatchObject({ x: 50 })
    expect(start.objects).toHaveLength(3)
  })

  it('reorders by the given order and never resurrects a removed object', () => {
    const next = applyScenePatch(board([note('a'), note('b')]), { order: ['b', 'a'], upserts: [note('c')], removes: ['c'] })
    expect(next.objects.map((object) => object.id)).toEqual(['b', 'a'])
  })

  it('replaces scenario, training, snapshots, and name whole', () => {
    const start = board()
    const training = { ...start.training, notes: 'Second alarm' }
    const next = applyScenePatch(start, { training, name: 'Night drill', scenario: { ...start.scenario, title: 'Changed' }, snapshots: [] })
    expect(next.training.notes).toBe('Second alarm')
    expect(next.name).toBe('Night drill')
    expect(next.scenario.title).toBe('Changed')
    expect(next.objects).toBe(start.objects)
  })

  it('appends to a recorded run, and can clear it', () => {
    const run = { startedAt: '2026-10-26T00:00:00.000Z', base: [], entries: [] }
    const entry = { id: 'e1', at: 5, kind: 'change' as const, label: 'Move' }
    const recording = applyScenePatch(board(), { run })
    const appended = applyScenePatch(recording, { runAppend: [entry] })
    expect(appended.run?.entries).toHaveLength(1)
    expect(applyScenePatch(appended, { run: null }).run).toBeNull()
    expect(applyScenePatch(board(), { runAppend: [entry] }).run).toBeNull()
  })
})

describe('diffBoards', () => {
  it('sends only the objects that changed', () => {
    const a = note('a')
    const before = board([a, note('b')])
    const after = { ...before, objects: [a, note('b', 10), note('c')] }
    const patch = diffBoards(before, after)
    expect(patch.upserts?.map((object) => object.id)).toEqual(['b', 'c'])
    expect(patch.removes).toBeUndefined()
    expect(patch.order).toBeUndefined()
    expect(applyScenePatch(before, patch).objects).toEqual(after.objects)
  })

  it('reports removals and reordering', () => {
    const [a, b, c] = [note('a'), note('b'), note('c')]
    const before = board([a, b, c])
    const patch = diffBoards(before, { ...before, objects: [c, a] })
    expect(patch.removes).toEqual(['b'])
    expect(patch.order).toEqual(['c', 'a'])
    expect(applyScenePatch(before, patch).objects.map((object) => object.id)).toEqual(['c', 'a'])
  })

  it('is empty when nothing changed', () => {
    const start = board([note('a')])
    expect(isEmptyPatch(diffBoards(start, start))).toBe(true)
    expect(isEmptyPatch(diffBoards(start, { ...start, objects: [...start.objects] }))).toBe(true)
  })

  it('sends only new timeline entries while a run is recording', () => {
    const entry = (at: number) => ({ id: 'e' + at, at, kind: 'change' as const, label: 'x' })
    const before = { ...board(), run: { startedAt: 'a', base: [], entries: [entry(1)] } }
    const after = { ...before, run: { ...before.run, entries: [...before.run.entries, entry(2)] } }
    expect(diffBoards(before, after)).toEqual({ runAppend: [entry(2)] })
    const restarted = { ...before, run: { startedAt: 'b', base: [], entries: [] } }
    expect(diffBoards(before, restarted)).toEqual({ run: restarted.run })
  })

  it('carries whole-value fields when they change', () => {
    const start = board()
    const patch = diffBoards(start, { ...start, name: 'Renamed', training: { ...start.training, notes: 'x' } })
    expect(patch).toEqual({ name: 'Renamed', training: { ...start.training, notes: 'x' } })
  })
})

describe('withoutPendingChanges', () => {
  it('leaves out objects and fields this browser changed but the server has not applied yet', () => {
    const remote = { upserts: [note('a', 1), note('b', 1)], removes: ['c', 'd'], order: ['b', 'a'], name: 'Theirs', training: board().training }
    const result = withoutPendingChanges(remote, [{ upserts: [note('a', 9)] }, { removes: ['c'], name: 'Mine', order: ['a', 'b'] }])
    expect(result).toEqual({ upserts: [note('b', 1)], removes: ['d'], training: board().training })
  })

  it('returns the remote patch untouched when nothing is pending', () => {
    const remote = { upserts: [note('a')] }
    expect(withoutPendingChanges(remote, [])).toBe(remote)
    expect(withoutPendingChanges(remote, [{}])).toBe(remote)
  })

  it('keeps the recorded run whole when this browser is also changing it', () => {
    const entry = { id: 'e', at: 1, kind: 'change' as const, label: 'x' }
    expect(withoutPendingChanges({ runAppend: [entry] }, [{ runAppend: [entry] }])).toEqual({})
    expect(withoutPendingChanges({ runAppend: [entry], run: null }, [{ upserts: [note('z')] }])).toEqual({ runAppend: [entry], run: null })
  })

  it('makes both screens agree when two people move the same unit at once', () => {
    const start = board([note('e1', 0)])
    const mine = { upserts: [note('e1', 10)] }
    const theirs = { upserts: [note('e1', 20)] }
    // The server received theirs first, then mine.
    const server = applyScenePatch(applyScenePatch(start, theirs), mine)
    const here = applyScenePatch(applyScenePatch(start, mine), withoutPendingChanges(theirs, [mine]))
    expect(here.objects).toEqual(server.objects)
  })
})
describe('client messages', () => {
  it('accepts a scenario switch only with a matching starting board', () => {
    const seedFor = (templateId: string | null) => ({ ...board(), templateId })
    expect(clientMessageSchema.safeParse({ type: 'switch', id: '1', key: 'oceanfront-condo', seed: seedFor('oceanfront-condo') }).success).toBe(true)
    expect(clientMessageSchema.safeParse({ type: 'switch', id: '1', key: 'oceanfront-condo', seed: seedFor('waterfront-estate') }).success).toBe(false)
    expect(clientMessageSchema.safeParse({ type: 'switch', id: '1', key: '../etc', seed: seedFor(null) }).success).toBe(false)
    expect(scenarioKey({ templateId: null })).toBe('custom')
    // An imported board's odd template id never becomes an unusable key.
    expect(scenarioKey({ templateId: 'My_Template' })).toBe('custom')
    expect(scenarioKey({ templateId: 'x'.repeat(70) })).toBe('custom')
    expect(clientMessageSchema.safeParse({ type: 'patch', id: '1', patch: {} }).success).toBe(false)
    expect(clientMessageSchema.safeParse({ type: 'patch', id: '1', patch: {}, on: 'waterfront-estate' }).success).toBe(true)
  })

  it('validates the hello, patch, and ping shapes, and has no client replace', () => {
    expect(clientMessageSchema.safeParse({ type: 'replace', id: '1', board: {} }).success).toBe(false)
    expect(clientMessageSchema.safeParse({ type: 'ping' }).success).toBe(true)
    expect(clientMessageSchema.safeParse({ type: 'patch', id: '1', on: 'custom', patch: { removes: ['a'] } }).success).toBe(true)
    expect(clientMessageSchema.safeParse({ type: 'patch', id: '1', on: 'custom', patch: { upserts: [{ id: 'x', type: 'bogus' }] } }).success).toBe(false)
    expect(clientMessageSchema.safeParse({ type: 'hello', clientId: 'c', seed: { nope: true } }).success).toBe(false)
  })
})
