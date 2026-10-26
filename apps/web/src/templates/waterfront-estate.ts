import { defaultBenchmarkCatalog, defaultHoseLoads } from '@mbfd/domain'
import type { ScenarioTemplate } from './types'

/**
 * Residential Structure Fire — Waterfront Estate.
 *
 * Content comes from the V2 seed (`apps/server/src/seed.ts` at de8a687). The
 * one hydrant is the instructor placement found in the live V2 production
 * scenario on 2026-10-26 (`data/migration/production-scenarios-2026-10-26.json`);
 * the live title had been changed to "Test" and is not carried forward.
 *
 * This template is immutable: working boards are copies of it.
 */
export const waterfrontEstate: ScenarioTemplate = {
  id: 'waterfront-estate',
  version: 1,
  scenario: {
    title: 'Residential Structure Fire — Waterfront Estate',
    description: 'A rendered residential structure-fire scene for multi-company tactical training.',
    dispatch: 'Residential structure fire with visible exterior fire conditions. Responding companies should position, establish water, and coordinate the initial attack.',
    background: { kind: 'builtin', url: '/scenario-assets/seed/background.webp' },
    world: { width: 1586, height: 992 },
    video: { kind: 'builtin', url: '/scenario-assets/seed/initial-conditions.mp4' },
    poster: { kind: 'builtin', url: '/scenario-assets/seed/initial-conditions-poster.webp' },
    conditions: { windFromDeg: null, windNote: '', northDeg: 0, weather: '' },
    injects: [
      { id: 'occupant-report', title: 'Occupant report', description: 'A neighbor reports that one occupant may still be inside.' },
      { id: 'changing-conditions', title: 'Changing conditions', description: 'Fire begins extending toward the upper floor.' },
    ],
    benchmarks: defaultBenchmarkCatalog.map((benchmark) => ({ ...benchmark })),
    hoseLoads: defaultHoseLoads,
    apparatusLengthFt: {},
  },
  objects: [
    {
      id: '2cbde021-f9b7-4507-b478-813a06010de5',
      type: 'hydrant',
      label: 'H1',
      status: 'unknown',
      notes: '',
      x: 1044.1340840783407,
      y: 719.2138500426084,
      rotation: 0,
      locked: false,
    },
  ],
}
