import { describe, expect, it } from 'vitest'
import type { HydrantObject, MarkerObject, SceneObject } from '@mbfd/domain'
import { UNCALIBRATED_UNITS_PER_FT } from '@mbfd/fire-model'
import { applyFireLayout, createFire, fireLayoutFrom, fireRadiusFor, fireSizeOf, isEffectMarker, layoutMatches, nextLayoutName, removeAllFire } from './fire'

const calibration = { feetPerWorldUnit: 0.5, a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distanceFt: 0.5, reference: '', calibratedAt: '2026-11-03T00:00:00.000Z' }
const calm = { windFromDeg: null, windNote: '', northDeg: 0, weather: '' }
const hydrant: HydrantObject = { id: 'h1', type: 'hydrant', label: 'H1', status: 'available', notes: '', x: 5, y: 5, rotation: 0, locked: false }

describe('createFire', () => {
  it('makes flames at the chosen size in real feet', () => {
    const [small] = createFire('flames', 'small', { x: 100, y: 200 }, { calibration, conditions: calm })
    const [large] = createFire('flames', 'large', { x: 100, y: 200 }, { calibration, conditions: calm })
    expect(small).toMatchObject({ type: 'marker', markerType: 'flames', x: 100, y: 200, rotation: 0 })
    expect(small!.radius! * calibration.feetPerWorldUnit).toBeCloseTo(7, 6)
    expect(large!.radius! * calibration.feetPerWorldUnit).toBeCloseTo(20, 6)
  })

  it('puts smoke under flames for "both", drifting downwind', () => {
    const fire = createFire('both', 'medium', { x: 0, y: 0 }, { calibration, conditions: { ...calm, windFromDeg: 270 } })
    expect(fire.map((marker) => marker.markerType)).toEqual(['smoke', 'flames'])
    expect(fire[0]!.rotation).toBe(90)
    expect(new Set(fire.map((marker) => marker.id)).size).toBe(2)
  })

  it('sizes fire on an uncalibrated map at the approximate drawing scale', () => {
    const [smoke] = createFire('smoke', 'medium', { x: 0, y: 0 }, { calibration: undefined, conditions: calm })
    expect(smoke!.radius).toBeCloseTo(18 * UNCALIBRATED_UNITS_PER_FT, 6)
    expect(fireSizeOf(smoke!, undefined)).toBe('medium')
  })
})

describe('fire size choices', () => {
  it('reads back and applies small, medium, and large', () => {
    const [flame] = createFire('flames', 'large', { x: 0, y: 0 }, { calibration, conditions: calm })
    expect(fireSizeOf(flame!, calibration.feetPerWorldUnit)).toBe('large')
    expect(fireRadiusFor(flame!, 'small', calibration.feetPerWorldUnit)! * calibration.feetPerWorldUnit).toBeCloseTo(7, 6)
    expect(fireSizeOf({ ...flame!, radius: 3 }, calibration.feetPerWorldUnit)).toBeUndefined()
    const zone: MarkerObject = { id: 'z', type: 'marker', markerType: 'collapse-zone', label: '', x: 0, y: 0, rotation: 0, locked: false, radius: 90 }
    expect(fireSizeOf(zone, 1)).toBeUndefined()
    expect(fireRadiusFor(zone, 'small', 1)).toBeUndefined()
  })
})

describe('fire layouts', () => {
  const fire = createFire('both', 'medium', { x: 300, y: 300 }, { calibration, conditions: calm })
  const objects: SceneObject[] = [hydrant, ...fire]

  it('capture only the flames and smoke', () => {
    const layout = fireLayoutFrom(objects, '  Garage fire  ', 'l1')
    expect(layout).toMatchObject({ id: 'l1', name: 'Garage fire' })
    expect(layout.effects.map((effect) => effect.markerType)).toEqual(['smoke', 'flames'])
    expect(fireLayoutFrom(objects, '   ').name).toBe('Fire layout')
    expect(isEffectMarker(hydrant)).toBe(false)
  })

  it('swap the fire on the map for the layout, leaving everything else', () => {
    const layout = fireLayoutFrom(objects, 'A', 'l1')
    const elsewhere = createFire('flames', 'small', { x: 900, y: 100 }, { calibration, conditions: calm })
    const swapped = applyFireLayout([hydrant, ...elsewhere], layout)
    expect(swapped.filter((object) => object.type === 'hydrant')).toEqual([hydrant])
    expect(swapped.filter(isEffectMarker).map((effect) => [effect.markerType, effect.x])).toEqual([['smoke', 300], ['flames', 300]])
    // Fresh ids, so showing the same layout twice never collides with what is on the map.
    expect(swapped.filter(isEffectMarker).some((effect) => fire.some((original) => original.id === effect.id))).toBe(false)
    expect(layoutMatches(swapped, layout)).toBe(true)
    expect(layoutMatches([hydrant, ...elsewhere], layout)).toBe(false)
    expect(layoutMatches(removeAllFire(swapped), { ...layout, effects: [] })).toBe(true)
  })

  it('notice a moved flame', () => {
    const layout = fireLayoutFrom(objects, 'A', 'l1')
    const moved = objects.map((object) => isEffectMarker(object) && object.markerType === 'flames' ? { ...object, x: object.x + 5 } : object)
    expect(layoutMatches(moved, layout)).toBe(false)
  })

  it('get a free default name', () => {
    expect(nextLayoutName([])).toBe('Fire layout 1')
    expect(nextLayoutName([{ id: 'a', name: 'Fire layout 2', effects: [] }])).toBe('Fire layout 3')
    expect(nextLayoutName([{ id: 'a', name: 'Kitchen', effects: [] }, { id: 'b', name: 'fire layout 3', effects: [] }])).toBe('Fire layout 4')
  })
})
