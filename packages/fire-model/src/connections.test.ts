import { describe, expect, it } from 'vitest'
import type { ApparatusObject, HoseObject, HydrantObject, NozzleObject, PortDefinition, SceneObject } from '@mbfd/domain'
import { canAttach, eligiblePorts, findSnapTarget, occupiedPorts, portKey, reconcileHose, reconcileHoses } from './connections.js'
import { findPort, portWorldPosition } from './ports.js'

function hydrant(id: string, x: number, y: number): HydrantObject {
  return { id, type: 'hydrant', label: id.toUpperCase(), status: 'available', notes: '', x, y, rotation: 0, locked: false }
}

function engine(id: string, x: number, y: number, rotation = 0): ApparatusObject {
  return { id, type: 'apparatus', templateId: 'E1', label: id.toUpperCase(), assignment: '', x, y, rotation, locked: false }
}

function nozzle(id: string, x: number, y: number): NozzleObject {
  return { id, type: 'nozzle', nozzleType: 'fog', x, y, rotation: 0, locked: false }
}

function hose(id: string, points: number[], ends: Pick<HoseObject, 'from' | 'to'> = {}, hoseType: HoseObject['hoseType'] = 'supply5'): HoseObject {
  return { id, type: 'hose', hoseType, purpose: hoseType === 'supply5' ? 'supply' : 'attack', points, label: '', locked: false, ...ends }
}

function portAt(object: SceneObject, portId: string) {
  return portWorldPosition(object, findPort(object, portId)!)
}

const inletStorz: PortDefinition = { id: 'intake', label: 'intake', size: 'storz-5', direction: 'inlet', x: 0, y: 0 }

describe('portKey and occupiedPorts', () => {
  it('collects every attached hose end', () => {
    const objects = [
      hose('s1', [0, 0, 1, 1], { from: { objectId: 'h1', portId: 'storz' }, to: { objectId: 'e1', portId: 'intake' } }),
      hose('s2', [0, 0, 1, 1], { to: { objectId: 'e2', portId: 'intake' } }),
      hydrant('h1', 0, 0),
    ]
    expect(portKey({ objectId: 'h1', portId: 'storz' })).toBe('h1:storz')
    expect([...occupiedPorts(objects)].sort()).toEqual(['e1:intake', 'e2:intake', 'h1:storz'])
    expect([...occupiedPorts(objects, 's1')]).toEqual(['e2:intake'])
  })
})

describe('canAttach', () => {
  it('requires the coupling size to match the hose', () => {
    expect(canAttach('supply5', inletStorz)).toBe(true)
    expect(canAttach('attack175', inletStorz)).toBe(false)
    expect(canAttach('hose3', inletStorz)).toBe(false)
  })

  it('requires the two ends to face opposite directions', () => {
    expect(canAttach('supply5', inletStorz, 'outlet')).toBe(true)
    expect(canAttach('supply5', inletStorz, 'inlet')).toBe(false)
  })
})

describe('findSnapTarget', () => {
  const h1 = hydrant('h1', 0, 0)
  const h2 = hydrant('h2', 30, 0)
  const e1 = engine('e1', 200, 0)

  it('snaps to the nearest compatible port within the radius', () => {
    const target = findSnapTarget([h1, h2, e1], { hoseType: 'supply5', point: { x: 20, y: 0 }, radius: 25 })
    expect(target).toMatchObject({ objectId: 'h2', portId: 'storz', x: 30, y: 0, distance: 10 })
    expect(target?.object).toBe(h2)
  })

  it('ignores ports outside the radius and of the wrong size', () => {
    expect(findSnapTarget([h1], { hoseType: 'supply5', point: { x: 50, y: 0 }, radius: 25 })).toBeUndefined()
    expect(findSnapTarget([h1], { hoseType: 'attack175', point: { x: 0, y: 0 }, radius: 25 })).toBeUndefined()
  })

  it('skips occupied ports unless the hose being edited holds them', () => {
    const laid = hose('s1', [0, 0, 100, 0], { from: { objectId: 'h1', portId: 'storz' } })
    expect(findSnapTarget([h1, laid], { hoseType: 'supply5', point: { x: 0, y: 0 }, radius: 25 })).toBeUndefined()
    expect(findSnapTarget([h1, laid], { hoseType: 'supply5', point: { x: 0, y: 0 }, radius: 25, excludeHoseId: 's1' })?.objectId).toBe('h1')
  })

  it('respects the other end direction', () => {
    const intake = portAt(e1, 'intake')
    expect(findSnapTarget([e1], { hoseType: 'supply5', point: intake, radius: 5, otherEndDirection: 'inlet' })).toBeUndefined()
    expect(findSnapTarget([e1], { hoseType: 'supply5', point: intake, radius: 5, otherEndDirection: 'outlet' })?.portId).toBe('intake')
  })

  it('applies the accept filter', () => {
    const onlyApparatus = (object: SceneObject) => object.type === 'apparatus'
    expect(findSnapTarget([h1], { hoseType: 'supply5', point: { x: 0, y: 0 }, radius: 25, accept: onlyApparatus })).toBeUndefined()
  })
})

describe('eligiblePorts', () => {
  it('lists every free, compatible, accepted port', () => {
    const h1 = hydrant('h1', 0, 0)
    const e1 = engine('e1', 200, 0)
    const e2 = engine('e2', 400, 0)
    const laid = hose('s1', [0, 0, 1, 1], { to: { objectId: 'e2', portId: 'intake' } })
    const targets = eligiblePorts([h1, e1, e2, laid], { hoseType: 'supply5' })
    expect(targets.map((target) => `${target.objectId}:${target.portId}`)).toEqual(['h1:storz', 'e1:intake'])
    const accepted = eligiblePorts([h1, e1, e2, laid], { hoseType: 'supply5', accept: (object) => object.type === 'hydrant' })
    expect(accepted.map((target) => target.objectId)).toEqual(['h1'])
  })
})

describe('reconcileHoses', () => {
  const h1 = hydrant('h1', 0, 0)
  const e1 = engine('e1', 200, 0)
  const intake = portAt(e1, 'intake')
  const supply = hose('s1', [0, 0, 100, 0, intake.x, intake.y], { from: { objectId: 'h1', portId: 'storz' }, to: { objectId: 'e1', portId: 'intake' } })

  it('returns the same array instance when nothing changed', () => {
    const objects = [h1, e1, supply]
    expect(reconcileHoses(objects)).toBe(objects)
    expect(reconcileHose(supply, new Map(objects.map((object) => [object.id, object])))).toBe(supply)
  })

  it('moves attached ends with a moved apparatus', () => {
    const moved = { ...e1, x: 300, y: 50 }
    const objects = [h1, moved, supply]
    const next = reconcileHoses(objects)
    expect(next).not.toBe(objects)
    const reconciled = next[2] as HoseObject
    const newIntake = portAt(moved, 'intake')
    expect(reconciled.points).toEqual([0, 0, 100, 0, newIntake.x, newIntake.y])
    expect(reconciled.from).toEqual({ objectId: 'h1', portId: 'storz' })
    expect(reconciled.to).toEqual({ objectId: 'e1', portId: 'intake' })
    expect(supply.points).toEqual([0, 0, 100, 0, intake.x, intake.y])
    expect(next[0]).toBe(h1)
  })

  it('moves the source end too', () => {
    const next = reconcileHoses([{ ...h1, x: -20 }, e1, supply])
    expect((next[2] as HoseObject).points.slice(0, 2)).toEqual([-20, 0])
  })

  it('releases references to deleted objects', () => {
    const next = reconcileHoses([h1, supply])
    const reconciled = next[1] as HoseObject
    expect(reconciled).not.toHaveProperty('to')
    expect(reconciled.from).toEqual({ objectId: 'h1', portId: 'storz' })
    expect(reconciled.points).toEqual(supply.points)
  })

  it('releases references to ports of the wrong size', () => {
    const wrong = hose('s2', [0, 0, 10, 10], { from: { objectId: 'e1', portId: 'discharge-1.5' } })
    const next = reconcileHoses([e1, wrong])
    expect(next[1]).not.toHaveProperty('from')
  })

  it('orients a hose so it runs from an outlet to an inlet', () => {
    const backwards = hose('s3', [intake.x, intake.y, 100, 0, 0, 0], { from: { objectId: 'e1', portId: 'intake' }, to: { objectId: 'h1', portId: 'storz' } })
    const reconciled = reconcileHoses([h1, e1, backwards])[2] as HoseObject
    expect(reconciled.from).toEqual({ objectId: 'h1', portId: 'storz' })
    expect(reconciled.to).toEqual({ objectId: 'e1', portId: 'intake' })
    expect(reconciled.points).toEqual([0, 0, 100, 0, intake.x, intake.y])
  })

  it('moves a lone inlet attachment to the far end (reverse lay in progress)', () => {
    const reverseLay = hose('s4', [intake.x, intake.y, 120, 40], { from: { objectId: 'e1', portId: 'intake' } })
    const reconciled = reconcileHoses([e1, reverseLay])[1] as HoseObject
    expect(reconciled).not.toHaveProperty('from')
    expect(reconciled.to).toEqual({ objectId: 'e1', portId: 'intake' })
    expect(reconciled.points).toEqual([120, 40, intake.x, intake.y])
  })

  it('moves a lone outlet attachment to the start', () => {
    const line = hose('s5', [50, 50, 0, 0], { to: { objectId: 'h1', portId: 'storz' } })
    const reconciled = reconcileHoses([h1, line])[1] as HoseObject
    expect(reconciled.from).toEqual({ objectId: 'h1', portId: 'storz' })
    expect(reconciled).not.toHaveProperty('to')
    expect(reconciled.points).toEqual([0, 0, 50, 50])
  })

  it('leaves an attack line to a nozzle alone when already correct', () => {
    const tip = nozzle('n1', 260, -80)
    const discharge = portAt(e1, 'discharge-1.5')
    const nozzleInlet = portAt(tip, 'inlet')
    const attack = hose('a1', [discharge.x, discharge.y, nozzleInlet.x, nozzleInlet.y], { from: { objectId: 'e1', portId: 'discharge-1.5' }, to: { objectId: 'n1', portId: 'inlet' } }, 'attack175')
    const objects = [e1, tip, attack]
    expect(reconcileHoses(objects)).toBe(objects)
  })

  it('uses the scene context to place to-scale ports', () => {
    const context = { calibration: { feetPerWorldUnit: 0.5, a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distanceFt: 0.5, reference: '', calibratedAt: '' }, apparatusLengthFt: { E1: 40 } }
    const reconciled = reconcileHoses([h1, e1, supply], context)[2] as HoseObject
    expect(reconciled.points.slice(-2)).toEqual([200, 38])
  })
})
