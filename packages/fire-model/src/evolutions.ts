import type { EvolutionId, HoseLoads, HosePurpose, HoseType, PortDefinition, SceneObject } from '@mbfd/domain'

/**
 * A packaged evolution is a guided sequence of hose lays. Each step says what
 * the line must start on, how it is finished, and which load (the hose the
 * apparatus actually carries) it is compared against.
 */
export type StartRule = 'water-source' | 'hydrant' | 'intake' | 'discharge' | 'previous-wye' | 'any'
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
      // "Supply line": start at a hydrant (forward lay) or at an engine (reverse lay).
      return [{ hoseType: 'supply5', purpose: 'supply', start: 'water-source', finish: 'none', loadFt: load['forward-lay'], layDirection: 'forward', prompt: { start: 'Tap a hydrant (forward lay) or an engine (reverse lay).', route: 'Route the 5″ to the other end: tap the engine or hydrant to connect.' } }]
    case 'reverse-lay':
      return [{ hoseType: 'supply5', purpose: 'supply', start: 'intake', finish: 'none', loadFt: load['reverse-lay'], layDirection: 'reverse', prompt: { start: 'Tap the engine to start the reverse lay.', route: 'Route the 5″ to a hydrant and tap it to connect.' } }]
    case 'jumpline':
      return [{ hoseType: 'attack175', purpose: 'attack', start: 'discharge', finish: 'nozzle', loadFt: load.jumpline, prompt: { start: 'Tap the engine or ladder to pull the preconnect.', route: 'Route the line to the fire, then Finish to place the nozzle.' } }]
    case 'trashline':
      return [{ hoseType: 'attack175', purpose: 'attack', start: 'discharge', finish: 'nozzle', loadFt: load.trashline, prompt: { start: 'Tap the engine to pull the trash line.', route: 'Route the line (100′, plus the 50′ roll if needed), then Finish.' } }]
    case 'high-rise-pack':
      return [{ hoseType: 'attack175', purpose: 'attack', start: 'any', finish: 'nozzle', loadFt: load['high-rise-pack'], prompt: { start: 'Tap where the packs connect: a standpipe outlet, wye, or the apparatus.', route: 'Route the line, then Finish to place the nozzle.' } }]
    case 'skid-load':
      return [
        { hoseType: 'hose3', purpose: 'feeder', start: 'discharge', finish: 'wye', loadFt: load['skid-load'], prompt: { start: 'Tap the engine to pull the 3″ line.', route: 'Route the 3″, then Finish where the gated wye goes.' } },
        { hoseType: 'attack175', purpose: 'attack', start: 'previous-wye', finish: 'nozzle', loadFt: load['skid-load-attack'], prompt: { start: 'The attack line starts at wye outlet A.', route: 'Route the attack line, then Finish to place the nozzle.' } },
      ]
  }
}

/** Whether a port satisfies a step's start rule. */
export function startRuleAccepts(rule: StartRule, object: SceneObject, port: PortDefinition): boolean {
  switch (rule) {
    case 'water-source': return object.type === 'hydrant' || (object.type === 'apparatus' && port.direction === 'inlet')
    case 'hydrant': return object.type === 'hydrant'
    case 'intake': return object.type === 'apparatus' && port.direction === 'inlet'
    case 'discharge': return object.type === 'apparatus' && port.direction === 'outlet'
    case 'previous-wye': return object.type === 'appliance'
    case 'any': return true
  }
}
