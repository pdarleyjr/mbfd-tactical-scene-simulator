import { describe, expect, it } from 'vitest'
import { sceneObjectSchema, type ApparatusObject, type HoseObject, type HydrantObject, type SceneObject } from '@mbfd/domain'
import {
  createApparatus,
  createHydrant,
  createMarker,
  defaultMarkerRadius,
  createNote,
  createNozzle,
  createWye,
  duplicateObjects,
  isOnScene,
  newId,
  nextHydrantLabel,
  translateObject,
} from './factories.js'

function apparatus(id: string, label: string, templateId: ApparatusObject['templateId'] = 'E1'): ApparatusObject {
  return { id, type: 'apparatus', templateId, label, assignment: '', x: 0, y: 0, rotation: 0, locked: false }
}

function hydrant(id: string, label: string): HydrantObject {
  return { id, type: 'hydrant', label, status: 'available', notes: '', x: 10, y: 10, rotation: 0, locked: false }
}

describe('isOnScene', () => {
  it('finds a unit by template, never by label', () => {
    expect(isOnScene('E1', [])).toBe(false)
    expect(isOnScene('E1', [apparatus('a', 'Engine One')])).toBe(true)
    expect(isOnScene('E1', [hydrant('h', 'E1')])).toBe(false)
    expect(isOnScene('L1', [apparatus('a', 'E1')])).toBe(false)
  })
})

describe('nextHydrantLabel', () => {
  it('returns the first unused H number', () => {
    expect(nextHydrantLabel([])).toBe('H1')
    expect(nextHydrantLabel([hydrant('a', 'H1'), hydrant('b', 'h3')])).toBe('H2')
    expect(nextHydrantLabel([hydrant('a', 'H1'), hydrant('b', 'H2')])).toBe('H3')
  })
})

describe('object factories', () => {
  it('creates valid objects with fresh ids', () => {
    const created: SceneObject[] = [
      createApparatus('E2', { x: 1, y: 2 }, 90, []),
      createHydrant({ x: 3, y: 4 }, []),
      createMarker('victim', { x: 5, y: 6 }),
      createNote({ x: 7, y: 8 }),
      createWye({ x: 9, y: 10 }, 45),
      createNozzle({ x: 11, y: 12 }, 0),
    ]
    for (const object of created) expect(sceneObjectSchema.safeParse(object).success).toBe(true)
    expect(new Set(created.map((object) => object.id)).size).toBe(created.length)
    expect(newId()).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('labels a unit by its designation and allows each unit only once', () => {
    expect(createApparatus('R2', { x: 0, y: 0 }, 0, [])).toMatchObject({ label: 'R2', templateId: 'R2', rotation: 0 })
    expect(() => createApparatus('E1', { x: 0, y: 0 }, 0, [apparatus('a', 'E1')])).toThrow('Engine 1 is already on the scene.')
    expect(createHydrant({ x: 0, y: 0 }, [hydrant('h', 'H1')])).toMatchObject({ label: 'H2', status: 'unknown' })
  })

  it('rejects unknown apparatus templates', () => {
    expect(() => createApparatus('Z9', { x: 0, y: 0 }, 0, [])).toThrow('Unknown apparatus Z9')
  })

  it('gives area markers a radius and point markers none', () => {
    expect(createMarker('collapse-zone', { x: 0, y: 0 }).radius).toBe(90)
    expect(createMarker('victim', { x: 0, y: 0 })).not.toHaveProperty('radius')
    // Flames and smoke start at a real size: 12 ft and 18 ft radius.
    expect(createMarker('flames', { x: 0, y: 0 }, 0.5).radius).toBe(24)
    expect(createMarker('smoke', { x: 0, y: 0 }, 0.5).radius).toBe(36)
    expect(createMarker('flames', { x: 0, y: 0 }).radius).toBeCloseTo(27, 6)
    expect(defaultMarkerRadius('collapse-zone', 0.5)).toBe(90)
    expect(defaultMarkerRadius('victim')).toBeUndefined()
  })

  it('applies defaults for notes and nozzles', () => {
    expect(createNote({ x: 0, y: 0 }).text).toBe('Note')
    expect(createNote({ x: 0, y: 0 }, 'RIT staged').text).toBe('RIT staged')
    expect(createNozzle({ x: 0, y: 0 }, 0).nozzleType).toBe('fog')
    expect(createNozzle({ x: 0, y: 0 }, 0, 'smooth-bore').nozzleType).toBe('smooth-bore')
    expect(createWye({ x: 0, y: 0 }, 30)).toMatchObject({ applianceType: 'gated-wye', rotation: 30 })
  })
})

describe('translateObject', () => {
  it('moves placed objects by their position', () => {
    const original = hydrant('h', 'H1')
    const moved = translateObject(original, 5, -5)
    expect(moved).toEqual({ ...original, x: 15, y: 5 })
    expect(original.x).toBe(10)
  })

  it('moves path objects by their points', () => {
    const arrow: SceneObject = { id: 'a', type: 'arrow', points: [0, 0, 10, 10], color: 'red', label: '', locked: false }
    expect(translateObject(arrow, 1, 2)).toEqual({ ...arrow, points: [1, 2, 11, 12] })
  })
})

describe('duplicateObjects', () => {
  const h1 = hydrant('h1', 'H1')
  const e1 = apparatus('e1', 'E1')
  const n1: SceneObject = { id: 'n1', type: 'nozzle', nozzleType: 'fog', x: 0, y: 0, rotation: 0, locked: false }
  const supply: HoseObject = { id: 's1', type: 'hose', hoseType: 'supply5', purpose: 'supply', points: [10, 10, 0, 0], from: { objectId: 'h1', portId: 'storz' }, to: { objectId: 'e1', portId: 'intake' }, label: '', locked: false }
  const attack: HoseObject = { id: 'a1', type: 'hose', hoseType: 'attack175', purpose: 'attack', points: [0, 0, 50, 50], from: { objectId: 'e1', portId: 'discharge-1.5' }, to: { objectId: 'n1', portId: 'inlet' }, label: '', locked: false }
  const all = [h1, e1, n1, supply, attack]

  it('copies with new ids, offsets, and fresh labels, but never copies a unit', () => {
    const copies = duplicateObjects([h1, e1], all)
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({ type: 'hydrant', label: 'H2', x: 34, y: 34 })
    expect(copies[0]!.id).not.toBe('h1')
  })

  it('keeps hose connections inside the copied set and drops external ones', () => {
    const [hCopy, nCopy, sCopy, aCopy] = duplicateObjects([h1, n1, supply, attack], all, { x: 0, y: 100 })
    const copiedSupply = sCopy as HoseObject
    const copiedAttack = aCopy as HoseObject
    expect(copiedSupply.from).toEqual({ objectId: hCopy!.id, portId: 'storz' })
    expect(copiedSupply).not.toHaveProperty('to')
    expect(copiedSupply.points).toEqual([10, 110, 0, 100])
    expect(copiedAttack.to).toEqual({ objectId: nCopy!.id, portId: 'inlet' })
    expect(copiedAttack).not.toHaveProperty('from')
  })

  it('releases both ends of a hose copied on its own', () => {
    const [copy] = duplicateObjects([supply], all)
    expect(copy).not.toHaveProperty('from')
    expect(copy).not.toHaveProperty('to')
  })
})