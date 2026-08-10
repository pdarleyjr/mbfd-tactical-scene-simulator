import { describe, expect, it } from 'vitest'
import {
  createRoomInputSchema,
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

  it('joins a selected room session with an optional access PIN and no room-code field', () => {
    const sessionId = '11111111-1111-4111-8111-111111111111'
    const captain = joinSessionInputSchema.parse({ sessionId, roomPin: '2300', name: 'Captain', role: 'crew', unit: 'E2' })
    const engineer = joinSessionInputSchema.parse({ sessionId, name: 'Engineer', role: 'crew', unit: 'E2' })
    expect(captain.unit).toBe(engineer.unit)
    expect(captain.roomPin).toBe('2300')
    expect('code' in captain).toBe(false)
  })

  it('defines named rooms with optional PIN access and configurable scenario benchmarks', () => {
    expect(createRoomInputSchema.parse({ name: 'North Operations' })).toEqual({ name: 'North Operations' })
    expect(createRoomInputSchema.parse({ name: 'North Operations', accessPin: '4412' })).toEqual({ name: 'North Operations', accessPin: '4412' })
    const scenario = scenarioInputSchema.parse({
      title: 'Residential Structure Fire',
      description: 'Training scene',
      worldWidth: 1600,
      worldHeight: 1000,
      apparatusTemplateIds: ['E1'],
      evolutionIds: ['jumpline'],
      benchmarks: [{ id: 'water-established', label: 'Water supply established', description: 'Sustained supply is connected.' }],
      injects: [],
    })
    expect(scenario.benchmarks[0]?.label).toBe('Water supply established')
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
