import { describe, expect, it } from 'vitest'
import {
  firegroundObjectSchema,
  joinSessionInputSchema,
  scenarioInputSchema,
} from './schema.js'

describe('domain schemas', () => {
  it('accepts an arbitrary-aspect scenario with the initial MBFD apparatus catalog', () => {
    const parsed = scenarioInputSchema.parse({
      title: 'Residential Structure Fire — Waterfront Estate',
      description: 'Rendered training scene',
      worldWidth: 1586,
      worldHeight: 992,
      apparatusTemplateIds: ['E1', 'E2', 'E3', 'E4', 'L1', 'L3'],
      evolutionIds: ['jumpline', 'skid-load', 'high-rise-pack', 'forward-lay', 'reverse-lay'],
      injects: [],
    })

    expect(parsed.worldWidth / parsed.worldHeight).toBeCloseTo(1586 / 992)
  })

  it('rejects malformed room codes and allows several users to select the same unit', () => {
    expect(() => joinSessionInputSchema.parse({ code: '12', name: 'Smith', role: 'crew', unit: 'E2' })).toThrow()
    const captain = joinSessionInputSchema.parse({ code: 'A7K4M2', name: 'Captain', role: 'crew', unit: 'E2' })
    const engineer = joinSessionInputSchema.parse({ code: 'A7K4M2', name: 'Engineer', role: 'crew', unit: 'E2' })
    expect(captain.unit).toBe(engineer.unit)
  })

  it('requires attribution and logical world coordinates on tactical objects', () => {
    const object = firegroundObjectSchema.parse({
      id: 'apparatus-e1',
      type: 'apparatus',
      x: 420,
      y: 310,
      rotation: 0,
      locked: false,
      createdByClientId: 'client-1',
      createdByName: 'Smith',
      createdByUnit: 'E1',
      createdAt: '2026-08-07T12:00:00.000Z',
      updatedAt: '2026-08-07T12:00:00.000Z',
      apparatusTemplateId: 'E1',
    })

    expect(object.createdByUnit).toBe('E1')
    expect(object.x).toBe(420)
  })
})
