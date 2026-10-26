import { describe, expect, it } from 'vitest'
import type { ApparatusObject, Calibration, SceneObject } from '@mbfd/domain'
import { apparatusSize, findPort, portsFor, portWorldPosition } from './ports.js'

const calibration: Calibration = {
  feetPerWorldUnit: 0.5,
  a: { x: 0, y: 0 },
  b: { x: 100, y: 0 },
  distanceFt: 50,
  reference: '',
  calibratedAt: '2026-10-25T12:00:00.000Z',
}

function engine(overrides: Partial<ApparatusObject> = {}): ApparatusObject {
  return { id: 'e1', type: 'apparatus', templateId: 'E1', label: 'E1', assignment: '', x: 0, y: 0, rotation: 0, locked: false, ...overrides }
}

describe('apparatusSize', () => {
  it('uses the drawing default without calibration or a configured length', () => {
    expect(apparatusSize('E1')).toEqual({ length: 74, width: 74 * (368 / 1402), toScale: false })
    expect(apparatusSize('L1').length).toBe(104)
  })

  it('stays at the default when only one of calibration and length is present', () => {
    expect(apparatusSize('E1', { calibration })).toMatchObject({ length: 74, toScale: false })
    expect(apparatusSize('E1', { apparatusLengthFt: { E1: 40 } })).toMatchObject({ length: 74, toScale: false })
    expect(apparatusSize('E1', { calibration, apparatusLengthFt: { E2: 40 } })).toMatchObject({ length: 74, toScale: false })
  })

  it('draws to scale when both calibration and a length are present', () => {
    const size = apparatusSize('E1', { calibration, apparatusLengthFt: { E1: 40 } })
    expect(size.length).toBe(80)
    expect(size.width).toBeCloseTo(80 * (368 / 1402))
    expect(size.toScale).toBe(true)
  })

  it('falls back to a generic size for unknown templates', () => {
    expect(apparatusSize('Z9')).toEqual({ length: 74, width: 20, toScale: false })
  })
})

describe('portsFor', () => {
  it('gives engines a rear intake and two side discharges', () => {
    const ports = portsFor(engine())
    expect(ports.map((port) => [port.id, port.size, port.direction])).toEqual([
      ['intake', 'storz-5', 'inlet'],
      ['discharge-2.5', 'nh-2.5', 'outlet'],
      ['discharge-1.5', 'nh-1.5', 'outlet'],
    ])
    expect(ports[0]).toMatchObject({ x: 0, y: 35 })
  })

  it('gives aerials an intake and a single 1½″ discharge', () => {
    const ports = portsFor(engine({ templateId: 'L1', label: 'L1' }))
    expect(ports.map((port) => port.id)).toEqual(['intake', 'discharge-1.5'])
    expect(ports[0]?.y).toBe(50)
  })

  it('moves ports with the to-scale length', () => {
    const intake = findPort(engine(), 'intake', { calibration, apparatusLengthFt: { E1: 40 } })
    expect(intake?.y).toBe(38)
  })

  it('describes hydrant, wye, and nozzle ports', () => {
    const hydrant: SceneObject = { id: 'h', type: 'hydrant', label: 'H1', status: 'available', notes: '', x: 0, y: 0, rotation: 0, locked: false }
    const wye: SceneObject = { id: 'w', type: 'appliance', applianceType: 'gated-wye', x: 0, y: 0, rotation: 0, locked: false }
    const nozzle: SceneObject = { id: 'n', type: 'nozzle', nozzleType: 'fog', x: 0, y: 0, rotation: 0, locked: false }
    expect(portsFor(hydrant).map((port) => [port.id, port.direction])).toEqual([['storz', 'outlet']])
    expect(portsFor(wye).map((port) => [port.id, port.size, port.direction])).toEqual([
      ['inlet', 'nh-2.5', 'inlet'],
      ['outlet-a', 'nh-1.5', 'outlet'],
      ['outlet-b', 'nh-1.5', 'outlet'],
    ])
    expect(portsFor(nozzle).map((port) => [port.id, port.size, port.direction])).toEqual([['inlet', 'nh-1.5', 'inlet']])
  })

  it('gives notes, markers, and paths no ports', () => {
    expect(portsFor({ id: 'n', type: 'note', text: 'x', x: 0, y: 0, rotation: 0, locked: false })).toEqual([])
    expect(portsFor({ id: 'a', type: 'arrow', points: [0, 0, 1, 1], color: 'white', label: '', locked: false })).toEqual([])
  })
})

describe('portWorldPosition and findPort', () => {
  it('rotates ports with the object', () => {
    const rotated = engine({ x: 100, y: 100, rotation: 180 })
    const position = portWorldPosition(rotated, findPort(rotated, 'intake')!)
    expect(position.x).toBeCloseTo(100)
    expect(position.y).toBeCloseTo(65)
  })

  it('returns the local offset for objects without a position', () => {
    const arrow: SceneObject = { id: 'a', type: 'arrow', points: [0, 0, 1, 1], color: 'white', label: '', locked: false }
    expect(portWorldPosition(arrow, { id: 'p', label: 'p', size: 'nh-1.5', direction: 'inlet', x: 3, y: 4 })).toEqual({ x: 3, y: 4 })
  })

  it('returns undefined for an unknown port id', () => {
    expect(findPort(engine(), 'nope')).toBeUndefined()
  })
})
