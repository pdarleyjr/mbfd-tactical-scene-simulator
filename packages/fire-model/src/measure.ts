import type { Calibration, HoseLoads, HoseObject, Point } from '@mbfd/domain'
import { distance, polylineLength } from './geometry.js'

export interface LengthReading {
  /** Raw scene-image length. */
  world: number
  /** Feet, only when the map has a reference calibration. */
  feet?: number
  calibrated: boolean
  /** Human text such as "212 ft" or "212 u". */
  text: string
}

export function readLength(world: number, calibration?: Calibration): LengthReading {
  if (calibration) {
    const feet = world * calibration.feetPerWorldUnit
    return { world, feet, calibrated: true, text: `${formatFeet(feet)} ft` }
  }
  return { world, calibrated: false, text: `${Math.round(world)} u` }
}

export function formatFeet(feet: number): string {
  return feet >= 10 ? String(Math.round(feet)) : feet.toFixed(1)
}

/** Builds a calibration from two scene points and a known real distance. */
export function calibrationFromReference(a: Point, b: Point, distanceFt: number, reference = '', now = new Date()): Calibration {
  const world = distance(a, b)
  if (!(world > 0)) throw new Error('Pick two different points on the map.')
  if (!(distanceFt > 0) || !Number.isFinite(distanceFt) || distanceFt > 100_000) throw new Error('Enter the real distance in feet (up to 100,000).')
  if (distanceFt / world > 1000) throw new Error('Those points are too close together for that distance. Pick points farther apart.')
  return { feetPerWorldUnit: distanceFt / world, a, b, distanceFt, reference: reference.trim().slice(0, 120), calibratedAt: now.toISOString() }
}

export interface HoseReading {
  length: LengthReading
  /** Whole sections needed to cover the route at the configured section length. */
  sections?: number
  sectionLengthFt: number
  loadFt?: number
  /** Feet beyond the configured load length, when calibrated. */
  overLoadFt?: number
}

export function readHose(hose: Pick<HoseObject, 'points' | 'hoseType' | 'loadFt'>, loads: HoseLoads, calibration?: Calibration): HoseReading {
  const length = readLength(polylineLength(hose.points), calibration)
  const sectionLengthFt = loads.sectionLengthFt[hose.hoseType]
  const reading: HoseReading = { length, sectionLengthFt }
  if (length.feet !== undefined) reading.sections = Math.max(1, Math.ceil(length.feet / sectionLengthFt - 1e-9))
  if (hose.loadFt) {
    reading.loadFt = hose.loadFt
    if (length.feet !== undefined && length.feet > hose.loadFt) reading.overLoadFt = length.feet - hose.loadFt
  }
  return reading
}

/** Picks a round scale-bar length that renders between ~60 and ~160 px. */
export function scaleBar(pixelsPerWorldUnit: number, calibration?: Calibration): { pixels: number; label: string } {
  const unitsPerPixel = calibration ? calibration.feetPerWorldUnit / pixelsPerWorldUnit : 1 / pixelsPerWorldUnit
  const target = unitsPerPixel * 110
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const step = [1, 2, 5, 10].map((factor) => factor * magnitude).find((value) => value >= target * 0.6) ?? magnitude * 10
  return { pixels: step / unitsPerPixel, label: calibration ? `${step} ft` : `${step} u` }
}
