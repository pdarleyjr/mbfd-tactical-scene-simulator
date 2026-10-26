import { describe, expect, it } from 'vitest'
import { defaultHoseLoads, type ApparatusObject, type ApplianceObject, type HoseObject, type HydrantObject, type NozzleObject, type SceneObject } from '@mbfd/domain'
import { analyzeWaterSupply, describeHose, objectName } from './network.js'

function hydrant(id: string, status: HydrantObject['status'] = 'available'): HydrantObject {
  return { id, type: 'hydrant', label: id.toUpperCase(), status, notes: '', x: 0, y: 0, rotation: 0, locked: false }
}

function engine(id: string): ApparatusObject {
  return { id, type: 'apparatus', templateId: 'E1', label: id.toUpperCase(), assignment: '', x: 0, y: 0, rotation: 0, locked: false }
}

function wye(id: string): ApplianceObject {
  return { id, type: 'appliance', applianceType: 'gated-wye', x: 0, y: 0, rotation: 0, locked: false }
}

function nozzle(id: string, nozzleType: NozzleObject['nozzleType'] = 'fog'): NozzleObject {
  return { id, type: 'nozzle', nozzleType, x: 0, y: 0, rotation: 0, locked: false }
}

function line(id: string, hoseType: HoseObject['hoseType'], purpose: HoseObject['purpose'], from?: [string, string], to?: [string, string], extra: Partial<HoseObject> = {}): HoseObject {
  return {
    id,
    type: 'hose',
    hoseType,
    purpose,
    points: [0, 0, 100, 0],
    label: '',
    locked: false,
    ...(from ? { from: { objectId: from[0], portId: from[1] } } : {}),
    ...(to ? { to: { objectId: to[0], portId: to[1] } } : {}),
    ...extra,
  }
}

function issueIds(objects: SceneObject[]) {
  return analyzeWaterSupply(objects).issues.map((issue) => issue.id)
}

describe('analyzeWaterSupply', () => {
  it('supplies an engine from a hydrant through a 5″ line', () => {
    const objects: SceneObject[] = [
      hydrant('h1'),
      engine('e1'),
      nozzle('n1'),
      line('supply', 'supply5', 'supply', ['h1', 'storz'], ['e1', 'intake']),
      line('attack', 'attack175', 'attack', ['e1', 'discharge-1.5'], ['n1', 'inlet']),
    ]
    const report = analyzeWaterSupply(objects)
    expect(report.lines.get('supply')).toBe('hydrant')
    expect(report.lines.get('attack')).toBe('hydrant')
    expect(report.apparatus.get('e1')).toEqual({ supplied: true, hydrantIds: ['h1'], supplyLineIds: ['supply'], outputLineIds: ['attack'] })
    expect(report.issues).toEqual([])
  })

  it('carries hydrant water through a wye and a relay engine', () => {
    const objects: SceneObject[] = [
      hydrant('h1'),
      engine('e1'),
      engine('e2'),
      wye('w1'),
      nozzle('n1'),
      line('supply', 'supply5', 'supply', ['h1', 'storz'], ['e1', 'intake']),
      line('relay', 'supply5', 'supply', ['e1', 'discharge-2.5'], ['e2', 'intake']),
      line('feeder', 'hose3', 'feeder', ['e2', 'discharge-2.5'], ['w1', 'inlet']),
      line('attack', 'attack175', 'attack', ['w1', 'outlet-a'], ['n1', 'inlet']),
    ]
    const report = analyzeWaterSupply(objects)
    expect([...report.lines.values()]).toEqual(['hydrant', 'hydrant', 'hydrant', 'hydrant'])
    expect(report.apparatus.get('e2')).toMatchObject({ supplied: true, hydrantIds: ['h1'], supplyLineIds: ['relay'] })
  })

  it('marks lines from an unsupplied engine as tank water, including through a wye', () => {
    const objects: SceneObject[] = [
      engine('e1'),
      wye('w1'),
      nozzle('n1'),
      line('feeder', 'hose3', 'feeder', ['e1', 'discharge-2.5'], ['w1', 'inlet']),
      line('attack', 'attack175', 'attack', ['w1', 'outlet-a'], ['n1', 'inlet']),
    ]
    const report = analyzeWaterSupply(objects)
    expect(report.lines.get('feeder')).toBe('tank')
    expect(report.lines.get('attack')).toBe('tank')
    expect(report.apparatus.get('e1')?.supplied).toBe(false)
    expect(report.issues).toEqual([{ id: 'e1:tank', severity: 'info', objectId: 'e1', message: 'E1 is flowing tank water only — no supply line is connected.' }])
  })

  it('marks unconnected hose as dry', () => {
    const report = analyzeWaterSupply([line('loose', 'supply5', 'supply')])
    expect(report.lines.get('loose')).toBe('dry')
    expect(report.issues).toEqual([{ id: 'loose:loose', severity: 'info', objectId: 'loose', message: '5″ supply line is not connected at either end.' }])
  })

  it('does not treat an out-of-service hydrant as a source', () => {
    const objects: SceneObject[] = [
      hydrant('h1', 'out-of-service'),
      engine('e1'),
      line('supply', 'supply5', 'supply', ['h1', 'storz'], ['e1', 'intake']),
    ]
    const report = analyzeWaterSupply(objects)
    expect(report.lines.get('supply')).toBe('dry')
    expect(report.apparatus.get('e1')?.supplied).toBe(false)
    expect(report.issues).toContainEqual({ id: 'h1:oos', severity: 'warning', objectId: 'h1', message: 'H1 is marked out of service but has a line attached.' })
  })

  it('still treats low-pressure and unknown hydrants as sources', () => {
    for (const status of ['low-pressure', 'unknown'] as const) {
      const report = analyzeWaterSupply([hydrant('h1', status), engine('e1'), line('s', 'supply5', 'supply', ['h1', 'storz'], ['e1', 'intake'])])
      expect(report.apparatus.get('e1')?.supplied).toBe(true)
    }
  })

  it('flags open ends, missing sources, missing nozzles, and attack lines ending at a wye', () => {
    const objects: SceneObject[] = [
      engine('e1'),
      wye('w1'),
      nozzle('n1'),
      line('noSource', 'attack175', 'attack', undefined, ['n1', 'inlet']),
      line('noNozzle', 'attack175', 'attack', ['e1', 'discharge-1.5']),
      line('openFeeder', 'hose3', 'feeder', ['e1', 'discharge-2.5']),
      line('toWye', 'attack175', 'attack', ['e1', 'discharge-1.5'], ['w1', 'inlet']),
    ]
    const report = analyzeWaterSupply(objects)
    expect(report.issues.map((issue) => [issue.id, issue.severity])).toEqual([
      ['noSource:source', 'warning'],
      ['noNozzle:nozzle', 'warning'],
      ['openFeeder:open', 'warning'],
      ['toWye:wye', 'info'],
      ['e1:tank', 'info'],
    ])
    expect(report.issues[1]?.message).toBe('1¾″ attack (E1 → open end) has no nozzle at the end.')
    expect(report.lines.get('noSource')).toBe('dry')
  })

  it('flags lines longer than their configured load only when loads are supplied and the map is calibrated', () => {
    const long = line('long', 'supply5', 'supply', ['h1', 'storz'], ['e1', 'intake'], { points: [0, 0, 300, 0], loadFt: 200 })
    const objects: SceneObject[] = [hydrant('h1'), engine('e1'), long]
    const calibration = { feetPerWorldUnit: 1, a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distanceFt: 1, reference: '', calibratedAt: '' }
    expect(issueIds(objects)).toEqual([])
    expect(analyzeWaterSupply(objects, { loads: defaultHoseLoads }).issues).toEqual([])
    expect(analyzeWaterSupply(objects, { loads: defaultHoseLoads, calibration }).issues).toEqual([
      { id: 'long:load', severity: 'warning', objectId: 'long', message: '5″ supply (H1 → E1) needs 300 ft but the configured load is 200 ft.' },
    ])
  })

  it('ignores connections to objects that no longer exist', () => {
    const report = analyzeWaterSupply([hydrant('h1'), line('s', 'supply5', 'supply', ['h1', 'storz'], ['gone', 'intake'])])
    expect(report.lines.get('s')).toBe('hydrant')
    expect(report.apparatus.size).toBe(0)
  })

  it('does not loop forever on a cycle', () => {
    const objects: SceneObject[] = [
      hydrant('h1'),
      engine('e1'),
      engine('e2'),
      line('s', 'supply5', 'supply', ['h1', 'storz'], ['e1', 'intake']),
      line('ab', 'supply5', 'supply', ['e1', 'discharge-2.5'], ['e2', 'intake']),
      line('ba', 'supply5', 'supply', ['e2', 'discharge-2.5'], ['e1', 'intake']),
    ]
    const report = analyzeWaterSupply(objects)
    expect(report.apparatus.get('e1')).toMatchObject({ supplied: true, hydrantIds: ['h1'], supplyLineIds: ['s', 'ba'] })
  })
})

describe('objectName and describeHose', () => {
  it('names objects for messages', () => {
    expect(objectName(undefined)).toBe('unknown')
    expect(objectName(engine('e3'))).toBe('E3')
    expect(objectName(hydrant('h2'))).toBe('H2')
    expect(objectName(wye('w'))).toBe('gated wye')
    expect(objectName(nozzle('n'))).toBe('fog nozzle')
    expect(objectName(nozzle('n', 'smooth-bore'))).toBe('smooth-bore nozzle')
    expect(objectName({ id: 'x', type: 'note', text: 'x', x: 0, y: 0, rotation: 0, locked: false })).toBe('note')
  })

  it('describes a hose by type, purpose, and ends', () => {
    const index = new Map<string, SceneObject>([['e1', engine('e1')]])
    expect(describeHose(line('a', 'attack175', 'attack', ['e1', 'discharge-1.5'], ['gone', 'inlet']), index)).toBe('1¾″ attack (E1 → unknown)')
    expect(describeHose(line('b', 'supply5', 'supply'), index)).toBe('5″ supply (open end → open end)')
  })
})
