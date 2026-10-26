import { describe, expect, it } from 'vitest'
import { defaultHoseLoads, type Calibration } from '@mbfd/domain'
import { calibrationFromReference, formatFeet, readHose, readLength, scaleBar } from './measure.js'

function calibration(feetPerWorldUnit: number): Calibration {
  return { feetPerWorldUnit, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, distanceFt: 100 * feetPerWorldUnit, reference: '', calibratedAt: '2026-10-25T12:00:00.000Z' }
}

describe('readLength', () => {
  it('reports map units when uncalibrated', () => {
    const reading = readLength(212.4)
    expect(reading).toEqual({ world: 212.4, calibrated: false, text: '212 u' })
    expect(reading.text.endsWith(' u')).toBe(true)
  })

  it('reports feet when calibrated', () => {
    expect(readLength(100, calibration(0.5))).toEqual({ world: 100, feet: 50, calibrated: true, text: '50 ft' })
    expect(readLength(3, calibration(0.5)).text).toBe('1.5 ft')
  })
})

describe('formatFeet', () => {
  it('rounds long distances and keeps a decimal for short ones', () => {
    expect(formatFeet(10.4)).toBe('10')
    expect(formatFeet(212.6)).toBe('213')
    expect(formatFeet(9.94)).toBe('9.9')
    expect(formatFeet(0)).toBe('0.0')
  })
})

describe('calibrationFromReference', () => {
  const now = new Date('2026-10-25T12:00:00.000Z')

  it('derives feet per world unit from a reference distance', () => {
    const result = calibrationFromReference({ x: 0, y: 0 }, { x: 30, y: 40 }, 100, '  Driveway width  ', now)
    expect(result).toEqual({ feetPerWorldUnit: 2, a: { x: 0, y: 0 }, b: { x: 30, y: 40 }, distanceFt: 100, reference: 'Driveway width', calibratedAt: '2026-10-25T12:00:00.000Z' })
  })

  it('throws when both points are the same', () => {
    expect(() => calibrationFromReference({ x: 5, y: 5 }, { x: 5, y: 5 }, 100)).toThrow('Pick two different points on the map.')
  })

  it('throws for non-positive or non-finite distances', () => {
    for (const feet of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => calibrationFromReference({ x: 0, y: 0 }, { x: 10, y: 0 }, feet)).toThrow(/Enter the real distance in feet/)
    }
  })

  it('rejects calibrations the saved-board schema could not hold', () => {
    expect(() => calibrationFromReference({ x: 0, y: 0 }, { x: 1000, y: 0 }, 150_000)).toThrow(/up to 100,000/)
    expect(() => calibrationFromReference({ x: 0, y: 0 }, { x: 1, y: 0 }, 5000)).toThrow(/too close together/)
  })

  it('caps the reference label at 120 characters', () => {
    expect(calibrationFromReference({ x: 0, y: 0 }, { x: 10, y: 0 }, 10, 'r'.repeat(200)).reference).toHaveLength(120)
  })
})

describe('readHose', () => {
  const route = [0, 0, 150, 0, 150, 100] // 250 world units

  it('reports no sections or overage when uncalibrated', () => {
    const reading = readHose({ points: route, hoseType: 'supply5', loadFt: 100 }, defaultHoseLoads)
    expect(reading.length.text).toBe('250 u')
    expect(reading.sectionLengthFt).toBe(100)
    expect(reading.loadFt).toBe(100)
    expect(reading).not.toHaveProperty('sections')
    expect(reading).not.toHaveProperty('overLoadFt')
  })

  it('counts whole sections and the overage when calibrated', () => {
    const reading = readHose({ points: route, hoseType: 'supply5', loadFt: 200 }, defaultHoseLoads, calibration(1))
    expect(reading.length.feet).toBe(250)
    expect(reading.sections).toBe(3)
    expect(reading.overLoadFt).toBe(50)
  })

  it('does not round an exact multiple up to an extra section', () => {
    const reading = readHose({ points: [0, 0, 200, 0], hoseType: 'attack175', loadFt: 200 }, defaultHoseLoads, calibration(1))
    expect(reading.sections).toBe(2)
    expect(reading).not.toHaveProperty('overLoadFt')
  })

  it('always needs at least one section', () => {
    expect(readHose({ points: [0, 0, 0, 0], hoseType: 'hose3' }, defaultHoseLoads, calibration(1)).sections).toBe(1)
  })

  it('uses the configured section length for the hose type', () => {
    const loads = { ...defaultHoseLoads, sectionLengthFt: { ...defaultHoseLoads.sectionLengthFt, hose3: 50 } }
    const reading = readHose({ points: [0, 0, 120, 0], hoseType: 'hose3' }, loads, calibration(1))
    expect(reading.sectionLengthFt).toBe(50)
    expect(reading.sections).toBe(3)
    expect(reading).not.toHaveProperty('loadFt')
  })
})

describe('scaleBar', () => {
  it('picks a round length in map units when uncalibrated', () => {
    expect(scaleBar(1)).toEqual({ pixels: 100, label: '100 u' })
  })

  it('picks a round length in feet when calibrated', () => {
    expect(scaleBar(2, calibration(0.5))).toEqual({ pixels: 80, label: '20 ft' })
  })

  it('stays within a readable pixel range across zoom levels', () => {
    for (const zoom of [0.1, 0.37, 1, 2.5, 7, 10]) {
      const bar = scaleBar(zoom, calibration(0.8))
      expect(bar.pixels).toBeGreaterThanOrEqual(60)
      expect(bar.pixels).toBeLessThanOrEqual(160)
      expect(bar.label).toMatch(/^\d+(\.\d+)? ft$/)
    }
  })
})
