import { describe, expect, it } from 'vitest'
import { apparatusCatalog, apparatusModels, defaultHoseLoads, legacyHoseLoads, findApparatusTemplate, findMarker } from './catalog.js'
import {
  SCENE_SCHEMA_VERSION,
  boardSchema,
  exportFileSchema,
  isPathObject,
  isPlacedObject,
  repairBoard,
  upgradeBoard,
  salvageObjects,
  sceneObjectSchema,
  type SceneObject,
} from './scene.js'

function minimalBoard(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    id: 'board-1',
    name: 'Training board',
    templateId: null,
    createdAt: '2026-10-25T12:00:00.000Z',
    updatedAt: '2026-10-25T12:00:00.000Z',
    scenario: {
      title: 'Scenario',
      background: { kind: 'builtin', url: '/scenario-assets/seed/background.webp' },
      world: { width: 1600, height: 1000 },
    },
    objects: [],
    training: {},
    ...overrides,
  }
}

const hose = {
  id: 'hose-1',
  type: 'hose',
  hoseType: 'supply5',
  purpose: 'supply',
  points: [0, 0, 10, 10],
}

describe('sceneObjectSchema', () => {
  it('fills defaults for a sparse hydrant', () => {
    const parsed = sceneObjectSchema.parse({ id: 'h1', type: 'hydrant', x: 10, y: 20 })
    expect(parsed).toEqual({ id: 'h1', type: 'hydrant', x: 10, y: 20, rotation: 0, locked: false, label: 'Hydrant', status: 'unknown', notes: '' })
  })

  it('trims apparatus labels and rejects blank ones', () => {
    const parsed = sceneObjectSchema.parse({ id: 'a1', type: 'apparatus', templateId: 'E1', label: '  E1  ', x: 0, y: 0 })
    expect(parsed).toMatchObject({ label: 'E1', assignment: '', rotation: 0 })
    expect(sceneObjectSchema.safeParse({ id: 'a1', type: 'apparatus', templateId: 'E1', label: '   ', x: 0, y: 0 }).success).toBe(false)
  })

  it('rejects unknown apparatus templates and marker types', () => {
    expect(sceneObjectSchema.safeParse({ id: 'a1', type: 'apparatus', templateId: 'E9', label: 'E9', x: 0, y: 0 }).success).toBe(false)
    expect(sceneObjectSchema.safeParse({ id: 'm1', type: 'marker', markerType: 'unicorn', x: 0, y: 0 }).success).toBe(false)
    expect(sceneObjectSchema.safeParse({ id: 'm1', type: 'marker', markerType: 'collapse-zone', radius: 90, x: 0, y: 0 }).success).toBe(true)
  })

  it('rejects coordinates outside the world range and non-finite values', () => {
    expect(sceneObjectSchema.safeParse({ id: 'n1', type: 'note', text: 'x', x: 100_001, y: 0 }).success).toBe(false)
    expect(sceneObjectSchema.safeParse({ id: 'n1', type: 'note', text: 'x', x: Number.NaN, y: 0 }).success).toBe(false)
  })

  it('requires hose points as at least two x/y pairs', () => {
    expect(sceneObjectSchema.safeParse(hose).success).toBe(true)
    expect(sceneObjectSchema.safeParse({ ...hose, points: [0, 0, 10] }).success).toBe(false)
    expect(sceneObjectSchema.safeParse({ ...hose, points: [0, 0, 10, 10, 20] }).success).toBe(false)
    expect(sceneObjectSchema.safeParse({ ...hose, points: [0, 0] }).success).toBe(false)
  })

  it('accepts hose port references and rejects empty ones', () => {
    expect(sceneObjectSchema.safeParse({ ...hose, from: { objectId: 'h1', portId: 'storz' } }).success).toBe(true)
    expect(sceneObjectSchema.safeParse({ ...hose, from: { objectId: '', portId: 'storz' } }).success).toBe(false)
  })

  it('rejects unknown object types', () => {
    expect(sceneObjectSchema.safeParse({ id: 'x', type: 'helicopter', x: 0, y: 0 }).success).toBe(false)
  })
})

describe('boardSchema', () => {
  it('fills scenario, training, snapshot, and run defaults', () => {
    const board = boardSchema.parse(minimalBoard())
    expect(board.snapshots).toEqual([])
    expect(board.run).toBeNull()
    expect(board.training).toEqual({ timer: { running: false, startedAt: null, accumulatedMs: 0 }, revealed: {}, completed: {}, notes: '' })
    expect(board.scenario.conditions).toEqual({ windFromDeg: null, windNote: '', northDeg: 0, weather: '' })
    expect(board.scenario.hoseLoads).toEqual(defaultHoseLoads)
    expect(board.scenario.injects).toEqual([])
    expect(board.scenario.apparatusLengthFt).toEqual({})
  })

  it('rejects other schema versions', () => {
    expect(boardSchema.safeParse(minimalBoard({ schemaVersion: 2 })).success).toBe(false)
  })

  it('rejects a board with an invalid object rather than silently dropping it', () => {
    expect(boardSchema.safeParse(minimalBoard({ objects: [{ id: 'bad', type: 'hydrant' }] })).success).toBe(false)
  })

  it('only accepts operator lengths for known apparatus templates', () => {
    const ok = minimalBoard({ scenario: { ...minimalBoard().scenario, apparatusLengthFt: { E1: 38 } } })
    const bad = minimalBoard({ scenario: { ...minimalBoard().scenario, apparatusLengthFt: { Z1: 38 } } })
    expect(boardSchema.safeParse(ok).success).toBe(true)
    expect(boardSchema.safeParse(bad).success).toBe(false)
  })
})

describe('exportFileSchema', () => {
  const file = { format: 'mbfd-tactical-scene', version: SCENE_SCHEMA_VERSION, exportedAt: '2026-10-25T12:00:00.000Z', board: minimalBoard() }

  it('defaults media to an empty list', () => {
    expect(exportFileSchema.parse(file).media).toEqual([])
  })

  it('requires the format marker and data URLs for media', () => {
    expect(exportFileSchema.safeParse({ ...file, format: 'something-else' }).success).toBe(false)
    expect(exportFileSchema.safeParse({ ...file, media: [{ blobId: 'm1', mimeType: 'image/png', dataUrl: 'https://example.com/x.png' }] }).success).toBe(false)
    const parsed = exportFileSchema.parse({ ...file, media: [{ blobId: 'm1', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==' }] })
    expect(parsed.media[0]).toEqual({ blobId: 'm1', mimeType: 'image/png', name: '', dataUrl: 'data:image/png;base64,AA==' })
  })
})

describe('salvageObjects', () => {
  it('returns nothing for non-array input', () => {
    expect(salvageObjects(undefined)).toEqual({ objects: [], dropped: 0 })
    expect(salvageObjects({ id: 'x' })).toEqual({ objects: [], dropped: 0 })
  })

  it('keeps valid objects and counts the damaged ones', () => {
    const result = salvageObjects([
      { id: 'h1', type: 'hydrant', x: 1, y: 2 },
      { id: 'broken', type: 'hydrant' },
      null,
      { id: 'n1', type: 'note', text: 'Staging here', x: 3, y: 4 },
    ])
    expect(result.dropped).toBe(2)
    expect(result.objects.map((object) => object.id)).toEqual(['h1', 'n1'])
    expect(result.objects[0]).toMatchObject({ label: 'Hydrant', status: 'unknown' })
  })
})

describe('object kind guards', () => {
  const objects = salvageObjects([
    hose,
    { id: 'arrow', type: 'arrow', points: [0, 0, 1, 1] },
    { id: 'measure', type: 'measurement', points: [0, 0, 1, 1] },
    { id: 'wye', type: 'appliance', applianceType: 'gated-wye', x: 0, y: 0 },
    { id: 'nozzle', type: 'nozzle', nozzleType: 'fog', x: 0, y: 0 },
  ]).objects

  it('separates path objects from placed objects', () => {
    expect(objects).toHaveLength(5)
    expect(objects.filter(isPathObject).map((object: SceneObject) => object.id)).toEqual(['hose-1', 'arrow', 'measure'])
    expect(objects.filter(isPlacedObject).map((object: SceneObject) => object.id)).toEqual(['wye', 'nozzle'])
  })
})

describe('catalog lookups', () => {
  it('finds templates and markers by id', () => {
    expect(findApparatusTemplate('L1')?.kind).toBe('aerial')
    expect(findApparatusTemplate('nope')).toBeUndefined()
    expect(findMarker('collapse-zone')?.area).toBe(true)
    expect(findMarker('nope')).toBeUndefined()
    expect(apparatusCatalog.every((template) => apparatusModels[template.model].lengthFt > 20)).toBe(true)
  })
})

describe('repairBoard', () => {
  const fallback = boardSchema.parse(minimalBoard()).scenario

  it('returns valid boards unchanged', () => {
    const result = repairBoard(minimalBoard(), fallback)
    expect(result?.repaired).toBe(false)
  })

  it('keeps the custom map, training, snapshots, and template id when one setting is out of range', () => {
    const raw = minimalBoard({
      templateId: null,
      scenario: {
        title: 'Collins Ave',
        background: { kind: 'blob', blobId: 'map-1', mimeType: 'image/png', name: 'collins.png' },
        world: { width: 2400, height: 1600 },
        apparatusLengthFt: { E1: 38, L1: 250 },
        hoseLoads: { sectionLengthFt: { attack175: 50, hose3: 100, supply5: 100 }, loadLengthFt: { ...defaultHoseLoads.loadLengthFt, jumpline: 99_999 } },
      },
      objects: [hose, { id: 'bad', type: 'apparatus' }],
      training: { notes: 'Debrief notes' },
      snapshots: [{ id: 's1', name: 'Before attack', createdAt: '2026-10-25T12:00:00.000Z', elapsedMs: null, objects: [] }],
    })
    const result = repairBoard(raw, fallback)!
    expect(result.repaired).toBe(true)
    expect(result.board.templateId).toBeNull()
    expect(result.board.scenario.title).toBe('Collins Ave')
    expect(result.board.scenario.background).toMatchObject({ kind: 'blob', blobId: 'map-1' })
    expect(result.board.scenario.apparatusLengthFt).toEqual({ E1: 38 })
    expect(result.board.scenario.hoseLoads.sectionLengthFt.attack175).toBe(50)
    expect(result.board.scenario.hoseLoads.loadLengthFt.jumpline).toBe(defaultHoseLoads.loadLengthFt.jumpline)
    expect(result.board.objects.map((object) => object.id)).toEqual(['hose-1'])
    expect(result.board.training.notes).toBe('Debrief notes')
    expect(result.board.snapshots).toHaveLength(1)
    expect(result.board.id).toBe('board-1')
  })

  it('falls back only for required fields that cannot be read', () => {
    const result = repairBoard(minimalBoard({ scenario: { title: '', world: { width: -1, height: 5 } } }), fallback)!
    expect(result.board.scenario.title).toBe(fallback.title)
    expect(result.board.scenario.world).toEqual(fallback.world)
    expect(result.board.scenario.video).toBeUndefined()
  })

  it('returns undefined for non-objects', () => {
    expect(repairBoard(42, fallback)).toBeUndefined()
    expect(repairBoard(null, fallback)).toBeUndefined()
  })
})

describe('upgradeBoard', () => {
  const calibration = { feetPerWorldUnit: 0.58, a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distanceFt: 78, reference: 'court', calibratedAt: '2026-10-26T00:00:00.000Z' }
  const legacy = () => boardSchema.parse(minimalBoard({ scenario: { title: 'Scenario', background: { kind: 'builtin', url: '/seed.webp' }, world: { width: 10, height: 10 }, hoseLoads: legacyHoseLoads } }))

  it('moves untouched V2 hose loads to the MBFD loads and adds the template scale', () => {
    const { board, changed } = upgradeBoard(legacy(), { calibration, templateBackground: '/seed.webp' })
    expect(changed).toBe(true)
    expect(board.scenario.hoseLoads).toEqual(defaultHoseLoads)
    expect(board.scenario.calibration).toEqual(calibration)
  })

  it('keeps operator-changed loads, existing calibration, and custom maps', () => {
    const custom = legacy()
    const changedLoads = { ...custom, scenario: { ...custom.scenario, hoseLoads: { ...defaultHoseLoads, sectionLengthFt: { ...defaultHoseLoads.sectionLengthFt, hose3: 60 } } } }
    expect(upgradeBoard(changedLoads, { calibration, templateBackground: '/other.webp' })).toEqual({ board: changedLoads, changed: false })
  })
})
