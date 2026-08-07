import { describe, expect, it } from 'vitest'
import { createApparatus, createHydrant, moveObject } from './actions.js'

const actor = { clientId: 'client-e1', name: 'Smith', unit: 'E1' }

describe('scene actions', () => {
  it('creates a catalog-backed apparatus object with full ownership attribution', () => {
    const apparatus = createApparatus('E1', { x: 450, y: 300 }, actor)
    expect(apparatus).toEqual(expect.objectContaining({
      type: 'apparatus',
      apparatusTemplateId: 'E1',
      createdByClientId: 'client-e1',
      createdByName: 'Smith',
      createdByUnit: 'E1',
      x: 450,
      y: 300,
    }))
  })

  it('persists only the final semantic object position from a drag', () => {
    const apparatus = createApparatus('E1', { x: 100, y: 100 }, actor)
    const moved = moveObject(apparatus, { x: 320, y: 280 }, actor.clientId)
    expect(moved.x).toBe(320)
    expect(moved.y).toBe(280)
    expect(moved.updatedByClientId).toBe(actor.clientId)
  })

  it('creates ladder ports, placeable hydrants, and rejects unknown apparatus templates', () => {
    expect(createApparatus('L1', { x: 1, y: 2 }, actor).connectionPoints).toHaveLength(2)
    expect(createHydrant({ x: 9, y: 11 }, actor)).toEqual(expect.objectContaining({ type: 'hydrant', x: 9, y: 11 }))
    expect(() => createApparatus('UNKNOWN', { x: 0, y: 0 }, actor)).toThrow('Unknown apparatus template')
  })
})
