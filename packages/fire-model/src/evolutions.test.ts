import { describe, expect, it } from 'vitest'
import { defaultHoseLoads, type PortDefinition, type SceneObject } from '@mbfd/domain'
import { evolutionSteps, startRuleAccepts, type StartRule } from './evolutions.js'

describe('evolutionSteps', () => {
  it('lays forward and reverse lays as single 5″ supply steps', () => {
    expect(evolutionSteps('forward-lay', defaultHoseLoads)).toEqual([
      expect.objectContaining({ hoseType: 'supply5', purpose: 'supply', start: 'hydrant', finish: 'none', loadFt: 500, layDirection: 'forward' }),
    ])
    expect(evolutionSteps('reverse-lay', defaultHoseLoads)).toEqual([
      expect.objectContaining({ hoseType: 'supply5', start: 'intake', finish: 'none', layDirection: 'reverse' }),
    ])
  })

  it('finishes attack evolutions with a nozzle', () => {
    expect(evolutionSteps('jumpline', defaultHoseLoads)).toEqual([expect.objectContaining({ hoseType: 'attack175', purpose: 'attack', start: 'discharge', finish: 'nozzle', loadFt: 100 })])
    expect(evolutionSteps('high-rise-pack', defaultHoseLoads)).toEqual([expect.objectContaining({ hoseType: 'attack175', start: 'any', finish: 'nozzle', loadFt: 200 })])
  })

  it('builds the skid load as a feeder to a wye then an attack line', () => {
    const steps = evolutionSteps('skid-load', defaultHoseLoads)
    expect(steps.map((step) => [step.hoseType, step.purpose, step.start, step.finish, step.loadFt])).toEqual([
      ['hose3', 'feeder', 'discharge', 'wye', 300],
      ['attack175', 'attack', 'previous-wye', 'nozzle', 200],
    ])
    expect(steps.every((step) => step.prompt.start && step.prompt.route)).toBe(true)
  })

  it('uses the scenario-configured load lengths', () => {
    const loads = { ...defaultHoseLoads, loadLengthFt: { ...defaultHoseLoads.loadLengthFt, jumpline: 150, 'skid-load-attack': 250 } }
    expect(evolutionSteps('jumpline', loads)[0]?.loadFt).toBe(150)
    expect(evolutionSteps('skid-load', loads)[1]?.loadFt).toBe(250)
  })
})

describe('startRuleAccepts', () => {
  const engine: SceneObject = { id: 'e1', type: 'apparatus', templateId: 'E1', label: 'E1', assignment: '', x: 0, y: 0, rotation: 0, locked: false }
  const hydrant: SceneObject = { id: 'h1', type: 'hydrant', label: 'H1', status: 'available', notes: '', x: 0, y: 0, rotation: 0, locked: false }
  const wye: SceneObject = { id: 'w1', type: 'appliance', applianceType: 'gated-wye', x: 0, y: 0, rotation: 0, locked: false }
  const inlet: PortDefinition = { id: 'intake', label: 'intake', size: 'storz-5', direction: 'inlet', x: 0, y: 0 }
  const outlet: PortDefinition = { id: 'discharge-1.5', label: 'discharge', size: 'nh-1.5', direction: 'outlet', x: 0, y: 0 }

  const cases: Array<[StartRule, SceneObject, PortDefinition, boolean]> = [
    ['hydrant', hydrant, outlet, true],
    ['hydrant', engine, outlet, false],
    ['intake', engine, inlet, true],
    ['intake', engine, outlet, false],
    ['intake', wye, inlet, false],
    ['discharge', engine, outlet, true],
    ['discharge', engine, inlet, false],
    ['discharge', hydrant, outlet, false],
    ['previous-wye', wye, outlet, true],
    ['previous-wye', engine, outlet, false],
    ['any', hydrant, outlet, true],
    ['any', engine, inlet, true],
  ]

  it.each(cases.map(([rule, object, port, expected]) => ({ rule, object, port, expected, name: `${object.type} ${port.direction}` })))('$rule on $name accepts=$expected', ({ rule, object, port, expected }) => {
    expect(startRuleAccepts(rule, object, port)).toBe(expected)
  })
})
