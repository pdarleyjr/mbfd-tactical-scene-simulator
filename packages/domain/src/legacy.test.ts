import { describe, expect, it } from 'vitest'
import { defaultBenchmarkCatalog, defaultHoseLoads } from './catalog.js'
import { convertLegacyObject, convertLegacyScenario } from './legacy.js'
import { scenarioSchema } from './scene.js'

// TypeScript 6 defaults `types` to [], so @types/node is not loaded for this
// package. A narrowly typed dynamic import reads the fixture without adding
// Node globals to the domain package's type environment.
const fs = await import('node:fs' as string) as { readFileSync(path: URL, encoding: 'utf8'): string }
const fixtureUrl = new URL('../../../data/migration/production-scenarios-2026-10-26.json', import.meta.url)
const fixture = JSON.parse(fs.readFileSync(fixtureUrl, 'utf8')) as { items: unknown[] }

describe('convertLegacyScenario with the V2 production export', () => {
  const [waterfront, blank] = fixture.items

  it('carries over the waterfront scenario text, world, and assets', () => {
    const { scenario, warnings } = convertLegacyScenario(waterfront)
    expect(scenario.title).toBe('Test')
    expect(scenario.description).toBe('A rendered residential structure-fire scene for multi-company tactical training.')
    expect(scenario.dispatch).toMatch(/^Residential structure fire with visible exterior fire conditions/)
    expect(scenario.world).toEqual({ width: 1586, height: 992 })
    expect(scenario.background).toEqual({ kind: 'builtin', url: '/scenario-assets/seed/background.webp' })
    expect(scenario.video).toEqual({ kind: 'builtin', url: '/scenario-assets/seed/initial-conditions.mp4' })
    expect(scenario.poster).toEqual({ kind: 'builtin', url: '/scenario-assets/seed/initial-conditions-poster.webp' })
    expect(warnings).toEqual([])
    expect(scenarioSchema.safeParse(scenario).success).toBe(true)
  })

  it('converts the instructor hydrant', () => {
    const { objects } = convertLegacyScenario(waterfront)
    expect(objects).toEqual([
      {
        id: '2cbde021-f9b7-4507-b478-813a06010de5',
        type: 'hydrant',
        label: 'Hydrant',
        status: 'unknown',
        notes: '',
        x: 1044.1340840783407,
        y: 719.2138500426084,
        rotation: 0,
        locked: true,
      },
    ])
  })

  it('carries over injects and benchmarks', () => {
    const { scenario } = convertLegacyScenario(waterfront)
    expect(scenario.injects).toEqual([
      { id: 'inject-1', title: 'Occupant report', description: 'A neighbor reports that one occupant may still be inside.' },
      { id: 'inject-2', title: 'Changing conditions', description: 'Fire begins extending toward the upper floor.' },
    ])
    expect(scenario.benchmarks.map((benchmark) => benchmark.id)).toEqual(defaultBenchmarkCatalog.map((benchmark) => benchmark.id))
    expect(scenario.benchmarks[0]).toEqual({ id: 'command-established', label: 'Command established', description: 'The incident command function is announced and operating.' })
  })

  it('imports the blank scenario with a default background and a warning', () => {
    const { scenario, objects, warnings } = convertLegacyScenario(blank)
    expect(scenario.title).toBe('New Tactical Scenario')
    expect(scenario.world).toEqual({ width: 1600, height: 1000 })
    expect(scenario.background).toEqual({ kind: 'builtin', url: '/scenario-assets/seed/background.webp' })
    expect(scenario).not.toHaveProperty('video')
    expect(scenario).not.toHaveProperty('poster')
    expect(scenario.injects).toEqual([])
    expect(objects).toEqual([])
    expect(warnings).toEqual(['The scenario has no background image; attach one in Scenario settings.'])
  })

  it('gives each conversion its own copy of the hose loads', () => {
    const { scenario } = convertLegacyScenario(waterfront)
    expect(scenario.hoseLoads).toEqual(defaultHoseLoads)
    expect(scenario.hoseLoads).not.toBe(defaultHoseLoads)
  })
})

describe('convertLegacyScenario with damaged input', () => {
  it('reports unusable objects in warnings instead of throwing', () => {
    const result = convertLegacyScenario({
      title: '   ',
      staticObjects: [
        { id: 'bundle', type: 'hoseBundle' },
        { id: 'a1', type: 'apparatus', apparatusTemplateId: 'Z9' },
        { id: 'a2', type: 'apparatus' },
        { id: 'n1', type: 'annotation', text: '   ' },
        { id: 'm1', type: 'tacticalMarker', markerType: 'unicorn' },
        { id: 's1', type: 'hoseSegment', points: [1, 2, 'x', null] },
        { id: 'w1', type: 'weather-balloon' },
        {},
        null,
        { id: '', type: 'hydrant', x: 1, y: 1 },
        { id: 'far', type: 'hydrant', x: 1e9, y: 1 },
        { id: 'ok', type: 'hydrant', x: 5, y: 6 },
      ],
    })
    expect(result.scenario.title).toBe('Imported scenario')
    expect(result.objects.map((object) => object.id)).toEqual(['ok'])
    expect(result.warnings).toEqual([
      'The scenario has no background image; attach one in Scenario settings.',
      'Hose package marker (V2 bundles carried no geometry)',
      'Unknown apparatus template Z9',
      'Unknown apparatus template (none)',
      'Empty annotation',
      'Unknown marker unicorn',
      'Hose without a usable path',
      'Unsupported object type weather-balloon',
      'Unsupported object type (none)',
      'Unsupported object type (none)',
      '2 object(s) failed validation and were not imported.',
    ])
  })

  it('accepts entirely unusable input', () => {
    for (const input of [null, 'garbage', 42, []]) {
      const result = convertLegacyScenario(input)
      expect(result.scenario.title).toBe('Imported scenario')
      expect(result.scenario.world).toEqual({ width: 1600, height: 1000 })
      expect(result.objects).toEqual([])
      expect(result.scenario.benchmarks).toHaveLength(defaultBenchmarkCatalog.length)
    }
  })

  it('builds asset URLs from runtime paths and filters bad injects and benchmarks', () => {
    const { scenario, warnings } = convertLegacyScenario({
      title: 'Paths',
      worldWidth: Number.POSITIVE_INFINITY,
      feetPerWorldUnit: 0.42,
      assets: [
        { kind: 'background', runtimePath: 'seed/custom.webp' },
        { kind: 'video', runtimePath: 'seed/clip.mp4', posterPath: 'seed/clip.webp' },
      ],
      injects: [
        { title: 'Timed', description: 'd', revealAtSeconds: 120 },
        { title: '  ' },
        { title: 'Fractional', revealAtSeconds: 1.5 },
        { title: 'Negative', revealAtSeconds: -1 },
      ],
      benchmarks: [{ label: 'No id' }, { id: 'x', label: '' }, { id: 'keep', label: ' Keep ' }],
    })
    expect(scenario.background).toEqual({ kind: 'builtin', url: '/scenario-assets/seed/custom.webp' })
    expect(scenario.video).toEqual({ kind: 'builtin', url: '/scenario-assets/seed/clip.mp4' })
    expect(scenario.poster).toEqual({ kind: 'builtin', url: '/scenario-assets/seed/clip.webp' })
    expect(scenario.world.width).toBe(1600)
    expect(scenario.injects).toEqual([
      { id: 'inject-1', title: 'Timed', description: 'd', revealAtSeconds: 120 },
      { id: 'inject-2', title: 'Fractional', description: '' },
      { id: 'inject-3', title: 'Negative', description: '' },
    ])
    expect(scenario.benchmarks).toEqual([
      { id: 'benchmark-1', label: 'No id', description: '' },
      { id: 'keep', label: 'Keep', description: '' },
    ])
    expect(warnings).toContain('V2 stored a feet-per-unit value without a reference measurement; re-calibrate to confirm it.')
    expect(scenario).not.toHaveProperty('calibration')
  })
})

describe('convertLegacyObject', () => {
  it('numbers repeated apparatus of the same template', () => {
    const counts = new Map<string, number>()
    const first = convertLegacyObject({ id: 'a', type: 'apparatus', apparatusTemplateId: 'E1', x: 1, y: 2 }, counts)
    const second = convertLegacyObject({ id: 'b', type: 'apparatus', apparatusTemplateId: 'E1' }, counts)
    const ladder = convertLegacyObject({ id: 'c', type: 'apparatus', apparatusTemplateId: 'L3' }, counts)
    expect(first).toMatchObject({ type: 'apparatus', templateId: 'E1', label: 'E1', x: 1, y: 2 })
    expect(second).toMatchObject({ label: 'E1-2', x: 0, y: 0 })
    expect(ladder).toMatchObject({ label: 'L3' })
  })

  it('normalizes hydrant labels and statuses', () => {
    expect(convertLegacyObject({ id: 'h', type: 'hydrant', label: '', status: 'broken' }, new Map())).toMatchObject({ label: 'Hydrant', status: 'unknown' })
    expect(convertLegacyObject({ id: 'h', type: 'hydrant', label: 'H7', status: 'out-of-service' }, new Map())).toMatchObject({ label: 'H7', status: 'out-of-service' })
  })

  it('converts hose segments with connections and lay direction', () => {
    const hose = convertLegacyObject({
      id: 's1',
      type: 'hoseSegment',
      hoseType: 'mystery',
      points: [0, 0, Number.NaN, 10, 10, 20, 20, 99],
      layDirection: 'hydrant-to-apparatus',
      connectedFrom: { objectId: 'h1', portId: 'storz' },
      connectedTo: { objectId: 'e1', portId: 'intake-storz' },
      locked: true,
    }, new Map())
    expect(hose).toEqual({
      id: 's1',
      type: 'hose',
      hoseType: 'supply5',
      purpose: 'supply',
      points: [0, 0, 10, 10, 20, 20],
      from: { objectId: 'h1', portId: 'storz' },
      to: { objectId: 'e1', portId: 'intake' },
      layDirection: 'forward',
      label: '',
      locked: true,
    })
  })

  it('derives hose purpose and drops unknown port references', () => {
    const feeder = convertLegacyObject({ id: 'f', type: 'hoseSegment', hoseType: 'hose3', points: [0, 0, 1, 1], layDirection: 'feeder', connectedFrom: { objectId: 'e1', portId: 'mystery-port' } }, new Map())
    const attack = convertLegacyObject({ id: 'a', type: 'hoseSegment', hoseType: 'attack175', points: [0, 0, 1, 1], layDirection: 'apparatus-to-hydrant' }, new Map())
    expect(feeder).toMatchObject({ hoseType: 'hose3', purpose: 'feeder' })
    expect(feeder).not.toHaveProperty('from')
    expect(feeder).not.toHaveProperty('layDirection')
    expect(attack).toMatchObject({ hoseType: 'attack175', purpose: 'attack', layDirection: 'reverse' })
  })

  it('converts appliances, nozzles, annotations, and markers', () => {
    const counts = new Map<string, number>()
    expect(convertLegacyObject({ id: 'w', type: 'appliance' }, counts)).toMatchObject({ type: 'appliance', applianceType: 'gated-wye' })
    expect(convertLegacyObject({ id: 'n', type: 'nozzle', nozzleType: 'smooth-bore' }, counts)).toMatchObject({ nozzleType: 'smooth-bore' })
    expect(convertLegacyObject({ id: 'n', type: 'nozzle', nozzleType: 'other' }, counts)).toMatchObject({ nozzleType: 'fog' })
    expect(convertLegacyObject({ id: 't', type: 'annotation', text: `  ${'x'.repeat(600)}  ` }, counts)).toMatchObject({ type: 'note', text: 'x'.repeat(500) })
    expect(convertLegacyObject({ id: 'm', type: 'tacticalMarker', markerType: 'command-post', label: 'y'.repeat(50) }, counts)).toMatchObject({ type: 'marker', markerType: 'command-post', label: 'y'.repeat(40) })
  })

  it('generates an id when the record has none', () => {
    const converted = convertLegacyObject({ type: 'appliance' }, new Map())
    expect('id' in converted && converted.id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
