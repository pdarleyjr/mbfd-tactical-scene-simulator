import { describe, expect, it } from 'vitest'
import type { ApparatusObject, Board, Calibration, HoseObject, NozzleObject, SceneObject } from '@mbfd/domain'
import { boardFromTemplate } from '../templates'
import { debriefMarkdown } from './debrief'

const NOW = new Date('2026-10-25T14:00:00.000Z')
const HYDRANT_ID = '2cbde021-f9b7-4507-b478-813a06010de5'

function engine(id: string, label: string, assignment = ''): ApparatusObject {
  return { id, type: 'apparatus', templateId: 'E1', label, assignment, x: 900, y: 600, rotation: 0, locked: false }
}

function hose(id: string, hoseType: HoseObject['hoseType'], purpose: HoseObject['purpose'], points: number[], ends: Pick<HoseObject, 'from' | 'to'>, extra: Partial<HoseObject> = {}): HoseObject {
  return { id, type: 'hose', hoseType, purpose, points, label: '', locked: false, ...ends, ...extra }
}

function boardWith(objects: SceneObject[], patch: (board: Board) => Board = (board) => board): Board {
  const board = boardFromTemplate()
  return patch({ ...board, objects: [...board.objects, ...objects] })
}

const supply = hose('supply', 'supply5', 'supply', [0, 0, 250, 0], { from: { objectId: HYDRANT_ID, portId: 'storz' }, to: { objectId: 'e1', portId: 'intake' } }, { loadFt: 200 })
const attack = hose('attack', 'attack175', 'attack', [0, 0, 80, 0], { from: { objectId: 'e1', portId: 'discharge-1.5' } })

describe('debriefMarkdown', () => {
  it('summarizes benchmarks, injects, apparatus, and hose lines', () => {
    const board = boardWith([engine('e1', 'E1', 'Fire attack'), supply, attack], (base) => ({
      ...base,
      name: 'Morning drill',
      training: {
        ...base.training,
        timer: { running: false, startedAt: null, accumulatedMs: 600_000 },
        completed: { 'command-established': 65_000 },
        revealed: { 'occupant-report': 125_000 },
        notes: '  Good water supply.  ',
      },
    }))
    const text = debriefMarkdown(board, NOW)

    expect(text).toContain('# Residential Structure Fire — Waterfront Estate')
    expect(text).toContain('Board: Morning drill')
    expect(text).toContain('Scenario time: 10:00')
    expect(text).toContain('## Dispatch')
    expect(text).toContain('- [x] Command established (01:05)')
    expect(text).toContain('- [ ] Initial size-up complete')
    expect(text).toContain('- Occupant report: revealed at 02:05')
    expect(text).toContain('- Changing conditions: not revealed')
    expect(text).toContain('- E1, Fire attack: supplied from H1')
    expect(text).toContain('## Hose lines (map not calibrated: lengths in map units)')
    expect(text).toContain('- 5″ supply (H1 → E1): 250 u')
    expect(text).toContain('- 1¾″ attack (E1 → open end): 80 u')
    expect(text).not.toContain('sections')
    expect(text).toContain('## Open items')
    expect(text).toContain('- 1¾″ attack (E1 → open end) has no nozzle at the end.')
    expect(text).toContain('## Notes\n\nGood water supply.')
    expect(text).toContain('Connectivity only; no hydraulic calculation.')
  })

  it('reports feet, sections, and overage on a calibrated map', () => {
    const calibration: Calibration = { feetPerWorldUnit: 1, a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, distanceFt: 100, reference: '', calibratedAt: NOW.toISOString() }
    const tip: NozzleObject = { id: 'n1', type: 'nozzle', nozzleType: 'fog', x: 0, y: 0, rotation: 0, locked: false }
    const attached = { ...attack, to: { objectId: 'n1', portId: 'inlet' } }
    const board = boardWith([engine('e1', 'E1'), tip, supply, attached], (base) => ({ ...base, scenario: { ...base.scenario, calibration } }))
    const text = debriefMarkdown(board, NOW)
    expect(text).not.toContain('map not calibrated')
    expect(text).toContain('## Hose lines\n')
    expect(text).toContain('- 5″ supply (H1 → E1): 250 ft, 3 × 100 ft sections, 50 ft over the 200 ft load')
    expect(text).toContain('- 1¾″ attack (E1 → fog nozzle): 80 ft, 1 × 100 ft sections')
    expect(text).toContain('needs 250 ft but the configured load is 200 ft.')
  })

  it('describes tank-only and idle apparatus', () => {
    const board = boardWith([engine('e1', 'E1'), engine('e2', 'E2'), hose('a', 'attack175', 'attack', [0, 0, 10, 0], { from: { objectId: 'e1', portId: 'discharge-1.5' } })])
    const text = debriefMarkdown(board, NOW)
    expect(text).toContain('- E1: tank water only')
    expect(text).toContain('- E2: no lines')
  })

  it('handles an empty board', () => {
    const board = boardWith([], (base) => ({ ...base, objects: [], scenario: { ...base.scenario, dispatch: '', injects: [] } }))
    const text = debriefMarkdown(board, NOW)
    expect(text).not.toContain('## Dispatch')
    expect(text).toContain('## Injects\n\nNone.')
    expect(text).toContain('None placed.')
    expect(text).toContain('None laid.')
    expect(text).not.toContain('## Open items')
    expect(text).not.toContain('## Notes')
  })
})
