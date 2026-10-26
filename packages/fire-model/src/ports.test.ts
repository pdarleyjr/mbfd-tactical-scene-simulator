import { describe, expect, it } from 'vitest'
import { apparatusModels, type ApparatusObject, type Calibration, type SceneObject } from '@mbfd/domain'
import { apparatusModelFor, apparatusSize, findPort, hitsObject, portsFor, portWorldPosition } from './ports.js'

const calibration: Calibration = { feetPerWorldUnit: 0.5, a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, distanceFt: 100, reference: '', calibratedAt: '2026-10-26T00:00:00.000Z' }

function unit(templateId: ApparatusObject['templateId'], extra: Partial<ApparatusObject> = {}): ApparatusObject {
  return { id: templateId, type: 'apparatus', templateId, label: templateId, assignment: '', x: 100, y: 100, rotation: 0, locked: false, ...extra }
}

describe('apparatus models', () => {
  it('maps each unit to its MBFD model', () => {
    expect(apparatusModelFor('E1').id).toBe('pierce-puc')
    expect(apparatusModelFor('L1').id).toBe('pierce-ascendant')
    expect(apparatusModelFor('L3').id).toBe('pierce-arrow-xt')
    expect(apparatusModelFor('R2').id).toBe('horton-rescue')
    expect(apparatusModelFor('L3', 'pierce-dash-2000').id).toBe('pierce-dash-2000')
    expect(apparatusModelFor('L3', 'nonsense').id).toBe('pierce-arrow-xt')
  })
})

describe('apparatusSize', () => {
  it('draws real length on a calibrated map', () => {
    const size = apparatusSize('E1', { calibration })
    expect(size.toScale).toBe(true)
    expect(size.length).toBeCloseTo(apparatusModels['pierce-puc'].lengthFt / 0.5, 6)
    expect(size.unitsPerFt).toBe(2)
    expect(size.width / size.length).toBeCloseTo(368 / 1402, 6)
  })

  it('uses an approximate scale on an uncalibrated map', () => {
    const size = apparatusSize('L1', {})
    expect(size.toScale).toBe(false)
    expect(size.length).toBeCloseTo(43 * 2.25, 6)
  })

  it('follows a model override and legacy length overrides', () => {
    expect(apparatusSize('L3', { calibration }, 'pierce-dash-2000').length).toBeCloseTo(92, 6)
    expect(apparatusSize('E2', { calibration, apparatusLengthFt: { E2: 30 } }).length).toBeCloseTo(60, 6)
  })
})

describe('portsFor', () => {
  it('puts the engine intake on the driver side, 13 ft back from the front bumper', () => {
    const engine = unit('E1')
    const size = apparatusSize('E1', { calibration })
    const intake = findPort(engine, 'intake', { calibration })!
    expect(intake).toMatchObject({ size: 'storz-5', direction: 'inlet' })
    expect(intake.x).toBeCloseTo(-size.width / 2, 6)
    expect(intake.y).toBeCloseTo(-size.length / 2 + 13 * 2, 6)
    expect(portsFor(engine, { calibration }).map((port) => port.id)).toEqual(['intake', 'discharge-1.5', 'discharge-1.5b', 'discharge-2.5'])
  })

  it('uses each aerial model\'s intake position', () => {
    const ascendant = findPort(unit('L1'), 'intake', { calibration })!
    const arrow = findPort(unit('L3'), 'intake', { calibration })!
    expect(ascendant.y).toBeCloseTo(-43 + 17 * 2, 6)
    expect(arrow.y).toBeCloseTo(-(42 + 2 / 12) + 16 * 2, 6)
  })

  it('gives rescues no ports', () => {
    expect(portsFor(unit('R1'), { calibration })).toEqual([])
  })

  it('places hydrant, wye, and nozzle ports', () => {
    const hydrant: SceneObject = { id: 'h', type: 'hydrant', label: 'H1', status: 'available', notes: '', x: 0, y: 0, rotation: 0, locked: false }
    const wye: SceneObject = { id: 'w', type: 'appliance', applianceType: 'gated-wye', x: 0, y: 0, rotation: 0, locked: false }
    const nozzle: SceneObject = { id: 'n', type: 'nozzle', nozzleType: 'fog', x: 0, y: 0, rotation: 0, locked: false }
    expect(portsFor(hydrant).map((port) => port.id)).toEqual(['storz'])
    expect(portsFor(wye).map((port) => port.id)).toEqual(['inlet', 'outlet-a', 'outlet-b'])
    expect(portsFor(nozzle).map((port) => port.id)).toEqual(['inlet'])
    expect(portsFor({ id: 'm', type: 'marker', markerType: 'fire', label: '', x: 0, y: 0, rotation: 0, locked: false })).toEqual([])
  })
})

describe('portWorldPosition and hitsObject', () => {
  it('rotates ports with the object', () => {
    const engine = unit('E1', { rotation: 90 })
    const intake = findPort(engine, 'intake', { calibration })!
    const world = portWorldPosition(engine, intake)
    expect(world.x).toBeCloseTo(100 - intake.y, 6)
    expect(world.y).toBeCloseTo(100 + intake.x, 6)
  })

  it('hits a rotated vehicle body with a margin', () => {
    const engine = unit('E1', { rotation: 90 })
    const size = apparatusSize('E1', { calibration })
    expect(hitsObject(engine, { x: 100 + size.length / 2 - 1, y: 100 }, { calibration }, 0)).toBe(true)
    expect(hitsObject(engine, { x: 100, y: 100 + size.length / 2 - 1 }, { calibration }, 0)).toBe(false)
    expect(hitsObject(engine, { x: 100, y: 100 + size.width / 2 + 3 }, { calibration }, 5)).toBe(true)
  })

  it('hits round objects within their radius plus margin', () => {
    const hydrant: SceneObject = { id: 'h', type: 'hydrant', label: 'H1', status: 'available', notes: '', x: 0, y: 0, rotation: 0, locked: false }
    expect(hitsObject(hydrant, { x: 15, y: 0 }, {}, 2)).toBe(true)
    expect(hitsObject(hydrant, { x: 30, y: 0 }, {}, 2)).toBe(false)
    expect(hitsObject({ id: 'n', type: 'note', text: 'x', x: 0, y: 0, rotation: 0, locked: false }, { x: 0, y: 0 }, {}, 10)).toBe(false)
  })
})
