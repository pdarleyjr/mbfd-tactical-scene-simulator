import { defaultBenchmarkCatalog, defaultHoseLoads } from '@mbfd/domain'
import type { Calibration } from '@mbfd/domain'
import type { ScenarioTemplate } from './types'

/**
 * Approximate scale from the street on the right of the image: two 11 ft
 * travel lanes, curb line to the double yellow center line, measured on the
 * 2× map (1624 × 1056). The aerial is oblique, so distances are close but not
 * survey-grade; recalibrate in the app against a known distance if needed.
 */
const a = { x: 1388, y: 940 }
const b = { x: 1486, y: 940 }
export const oceanfrontCalibration: Calibration = {
  feetPerWorldUnit: 22 / Math.hypot(b.x - a.x, b.y - a.y),
  a,
  b,
  distanceFt: 22,
  reference: 'Street at right: two 11 ft lanes, curb to center line (approximate)',
  calibratedAt: '2026-10-27T00:00:00.000Z',
}

/**
 * High-Rise Residential Fire — Oceanfront Condominium.
 *
 * A second scenario on an aerial of a curved oceanfront condominium tower
 * with a circular drive. No initial-conditions video. This template is
 * immutable: working boards are copies of it.
 */
export const oceanfrontCondo: ScenarioTemplate = {
  id: 'oceanfront-condo',
  version: 1,
  thumbnailUrl: '/scenario-assets/seed/oceanfront-background-thumb.webp',
  scenario: {
    title: 'High-Rise Residential Fire — Oceanfront Condominium',
    description: 'An occupied oceanfront condominium tower with a circular entry drive, for high-rise tactics and multi-company coordination.',
    dispatch: 'Reported fire in a residential high-rise. Smoke showing from an upper floor of an oceanfront condominium. Multiple calls; occupants reporting smoke in the hallways.',
    background: { kind: 'builtin', url: '/scenario-assets/seed/oceanfront-background.webp' },
    world: { width: 1624, height: 1056 },
    calibration: oceanfrontCalibration,
    conditions: { windFromDeg: null, windNote: '', northDeg: 0, weather: '' },
    injects: [
      { id: 'occupants-trapped', title: 'Occupants calling for help', description: 'Dispatch reports occupants on the fire floor and the floor above calling to say they cannot leave their units.' },
      { id: 'smoke-in-stairwell', title: 'Smoke in the attack stairwell', description: 'Crews report smoke migrating into the attack stairwell above the fire floor.' },
    ],
    benchmarks: defaultBenchmarkCatalog.map((benchmark) => ({ ...benchmark })),
    hoseLoads: defaultHoseLoads,
    apparatusLengthFt: {},
  },
  objects: [],
}
