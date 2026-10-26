import type { EvolutionId, HoseLoads, HosePurpose, HoseType, PortDefinition, SceneObject } from '@mbfd/domain'

/**
 * A packaged evolution is a guided sequence of hose lays. Each step says what
 * the line must start on, how it is finished, and which configured load
 * length it is compared against.
 */
export type StartRule = 'hydrant' | 'intake' | 'discharge' | 'previous-wye' | 'any'
export type FinishRule = 'nozzle' | 'wye' | 'none'

export interface EvolutionStep {
  hoseType: HoseType
  purpose: HosePurpose
  start: StartRule
  finish: FinishRule
  loadFt: number
  layDirection?: 'forward' | 'reverse'
  prompt: { start: string; route: string }
}

export function evolutionSteps(evolutionId: EvolutionId, loads: HoseLoads): EvolutionStep[] {
  const load = loads.loadLengthFt
  switch (evolutionId) {
    case 'forward-lay':
      return [{ hoseType: 'supply5', purpose: 'supply', start: 'hydrant', finish: 'none', loadFt: load['forward-lay'], layDirection: 'forward', prompt: { start: 'Tap a hydrant to start the forward lay.', route: 'Route the lay to an engine intake.' } }]
    case 'reverse-lay':
      return [{ hoseType: 'supply5', purpose: 'supply', start: 'intake', finish: 'none', loadFt: load['reverse-lay'], layDirection: 'reverse', prompt: { start: 'Tap the engine intake to start the reverse lay.', route: 'Route the lay to a hydrant.' } }]
    case 'jumpline':
      return [{ hoseType: 'attack175', purpose: 'attack', start: 'discharge', finish: 'nozzle', loadFt: load.jumpline, prompt: { start: 'Tap a 1½″ discharge to pull the jumpline.', route: 'Route the line to the fire. Finish to place the nozzle.' } }]
    case 'high-rise-pack':
      return [{ hoseType: 'attack175', purpose: 'attack', start: 'any', finish: 'nozzle', loadFt: load['high-rise-pack'], prompt: { start: 'Tap where the pack connects (standpipe, wye, or discharge).', route: 'Route the line. Finish to place the nozzle.' } }]
    case 'skid-load':
      return [
        { hoseType: 'hose3', purpose: 'feeder', start: 'discharge', finish: 'wye', loadFt: load['skid-load'], prompt: { start: 'Tap the 2½″ discharge to pull the skid load.', route: 'Route the 3″ feeder. Finish where the gated wye goes.' } },
        { hoseType: 'attack175', purpose: 'attack', start: 'previous-wye', finish: 'nozzle', loadFt: load['skid-load-attack'], prompt: { start: 'Attack line starts at wye outlet A.', route: 'Route the attack line. Finish to place the nozzle.' } },
      ]
  }
}

/** Whether a port satisfies a step's start rule. */
export function startRuleAccepts(rule: StartRule, object: SceneObject, port: PortDefinition): boolean {
  switch (rule) {
    case 'hydrant': return object.type === 'hydrant'
    case 'intake': return object.type === 'apparatus' && port.direction === 'inlet'
    case 'discharge': return object.type === 'apparatus' && port.direction === 'outlet'
    case 'previous-wye': return object.type === 'appliance'
    case 'any': return true
  }
}
