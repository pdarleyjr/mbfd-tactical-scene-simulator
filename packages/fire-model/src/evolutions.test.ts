import { describe, expect, it } from 'vitest'
import { canConnect, createEvolutionObjects, distanceBetween, findAvailableCompatiblePort } from './index.js'
import type { FiregroundObject } from '@mbfd/domain'

const actor = {
  clientId: 'client-e1',
  name: 'Smith',
  unit: 'E1',
} as const

describe('fireground connection model', () => {
  it('connects 1¾-inch hose couplings to independent gated-wye outlets', () => {
    expect(canConnect({ coupling: 'nh-1.5-female' }, { coupling: 'nh-1.5-male' })).toBe(true)
    expect(canConnect({ coupling: 'storz-5' }, { coupling: 'nh-1.5-male' })).toBe(false)
  })

  it('builds a skid load with a 3-inch feeder, wye, outlet-A attack line, and free outlet B', () => {
    const result = createEvolutionObjects('skid-load', actor, { x: 300, y: 240 }, 'apparatus-e1')
    const wye = result.objects.find((object) => object.type === 'appliance')
    const hoseTypes = result.objects.filter((object) => object.type === 'hoseSegment').map((object) => object.hoseType)

    expect(hoseTypes).toEqual(expect.arrayContaining(['hose3', 'attack175']))
    expect(wye?.connectionPoints?.find((port) => port.id === 'outlet-a')?.occupiedBy).toBeDefined()
    expect(wye?.connectionPoints?.find((port) => port.id === 'outlet-b')?.occupiedBy).toBeUndefined()
  })

  it('stores forward and reverse supply lays with opposite semantic direction', () => {
    const forward = createEvolutionObjects('forward-lay', actor, { x: 100, y: 100 }, 'hydrant-1')
    const reverse = createEvolutionObjects('reverse-lay', actor, { x: 100, y: 100 }, 'apparatus-e1')
    const forwardHose = forward.objects.find((object) => object.type === 'hoseSegment')
    const reverseHose = reverse.objects.find((object) => object.type === 'hoseSegment')

    expect(forwardHose?.layDirection).toBe('hydrant-to-apparatus')
    expect(reverseHose?.layDirection).toBe('apparatus-to-hydrant')
  })

  it('creates jumpline and high-rise bundles with the selected nozzle and required section counts', () => {
    const jump = createEvolutionObjects('jumpline', actor, { x: 20, y: 30 }, 'engine-1', { nozzle: 'smooth-bore' })
    const highRise = createEvolutionObjects('high-rise-pack', actor, { x: 20, y: 30 }, 'engine-1')
    expect(jump.objects.find((object) => object.type === 'hoseBundle')).toEqual(expect.objectContaining({ sectionCount: 1, selectedNozzle: 'smooth-bore' }))
    expect(highRise.objects.find((object) => object.type === 'hoseBundle')).toEqual(expect.objectContaining({ sectionCount: 2, nominalLengthFt: 200 }))
  })

  it('finds only free compatible ports and computes snap distance', () => {
    const apparatus = { ...createEvolutionObjects('forward-lay', actor, { x: 0, y: 0 }, 'hydrant').objects[0], type: 'apparatus', apparatusTemplateId: 'E1', scale: 1, status: 'positioned', connectionPoints: [{ id: 'free', label: 'Free', coupling: 'storz-5', direction: 'inlet', x: 0, y: 0 }, { id: 'busy', label: 'Busy', coupling: 'nh-1.5-male', direction: 'outlet', x: 0, y: 0, occupiedBy: 'hose' }] } as FiregroundObject
    expect(findAvailableCompatiblePort(apparatus, 'storz-5')?.id).toBe('free')
    expect(findAvailableCompatiblePort(apparatus, 'nh-1.5-female')).toBeUndefined()
    expect(findAvailableCompatiblePort(createEvolutionObjects('forward-lay', actor, { x: 0, y: 0 }, 'hydrant').objects[0]!, 'storz-5')).toBeUndefined()
    expect(distanceBetween({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})
