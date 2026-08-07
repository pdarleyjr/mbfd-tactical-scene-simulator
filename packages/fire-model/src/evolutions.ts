import type { EvolutionId, FiregroundObject } from '@mbfd/domain'

export interface EvolutionActor {
  clientId: string
  name: string
  unit: string
}

export interface EvolutionResult {
  evolutionId: EvolutionId
  evolutionInstanceId: string
  objects: FiregroundObject[]
}

interface EvolutionOptions {
  nozzle?: 'fog' | 'smooth-bore'
}

function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function attribution(actor: EvolutionActor) {
  const now = new Date().toISOString()
  return {
    createdByClientId: actor.clientId,
    createdByName: actor.name,
    createdByUnit: actor.unit,
    createdAt: now,
    updatedAt: now,
  }
}

function positioned(actor: EvolutionActor, at: { x: number; y: number }) {
  return {
    x: at.x,
    y: at.y,
    rotation: 0,
    locked: false,
    ...attribution(actor),
  }
}

export function createEvolutionObjects(
  evolutionId: EvolutionId,
  actor: EvolutionActor,
  at: { x: number; y: number },
  sourceObjectId: string,
  options: EvolutionOptions = {},
): EvolutionResult {
  const instanceId = id(`evolution-${evolutionId}`)

  if (evolutionId === 'skid-load') {
    const feederId = id('hose3')
    const attackId = id('attack175')
    const wyeId = id('wye')
    const nozzleId = id('nozzle')
    const nozzle = options.nozzle ?? 'fog'
    const objects: FiregroundObject[] = [
      {
        ...positioned(actor, at),
        id: feederId,
        type: 'hoseSegment',
        hoseType: 'hose3',
        coupling: 'nh-2.5-female',
        startCoupling: 'nh-2.5-female',
        endCoupling: 'nh-2.5-male',
        points: [at.x - 150, at.y, at.x, at.y],
        nominalLengthFt: 300,
        sectionCount: 3,
        layDirection: 'feeder',
        connectedFrom: { objectId: sourceObjectId, portId: 'discharge-2.5' },
        connectedTo: { objectId: wyeId, portId: 'inlet' },
      },
      {
        ...positioned(actor, at),
        id: wyeId,
        type: 'appliance',
        applianceType: 'gated-wye',
        connectionPoints: [
          { id: 'inlet', label: '3-inch inlet', coupling: 'nh-2.5-female', direction: 'inlet', x: -18, y: 0, occupiedBy: feederId },
          { id: 'outlet-a', label: 'Outlet A', coupling: 'nh-1.5-male', direction: 'outlet', x: 18, y: -9, occupiedBy: attackId },
          { id: 'outlet-b', label: 'Outlet B', coupling: 'nh-1.5-male', direction: 'outlet', x: 18, y: 9 },
        ],
      },
      {
        ...positioned(actor, { x: at.x + 40, y: at.y - 20 }),
        id: attackId,
        type: 'hoseSegment',
        hoseType: 'attack175',
        coupling: 'nh-1.5-female',
        startCoupling: 'nh-1.5-female',
        endCoupling: 'nh-1.5-male',
        points: [at.x + 18, at.y - 9, at.x + 150, at.y - 80],
        nominalLengthFt: 200,
        sectionCount: 2,
        layDirection: 'attack',
        connectedFrom: { objectId: wyeId, portId: 'outlet-a' },
        connectedTo: { objectId: nozzleId, portId: 'inlet' },
      },
      {
        ...positioned(actor, { x: at.x + 150, y: at.y - 80 }),
        id: nozzleId,
        type: 'nozzle',
        nozzleType: nozzle,
        coupling: 'nh-1.5-female',
        connectedTo: { objectId: attackId, portId: 'end' },
      },
    ]
    return { evolutionId, evolutionInstanceId: instanceId, objects }
  }

  if (evolutionId === 'jumpline' || evolutionId === 'high-rise-pack') {
    const sectionCount = evolutionId === 'high-rise-pack' ? 2 : 1
    const nominalLengthFt = evolutionId === 'high-rise-pack' ? 200 : 100
    const nozzle = options.nozzle ?? 'fog'
    const hoseId = id('attack175')
    const nozzleId = id('nozzle')
    return {
      evolutionId,
      evolutionInstanceId: instanceId,
      objects: [
        {
          ...positioned(actor, at),
          id: id('bundle'),
          type: 'hoseBundle',
          bundleType: evolutionId,
          hoseType: 'attack175',
          sectionCount,
          nominalLengthFt,
          selectedNozzle: nozzle,
          deployedSegmentIds: [hoseId],
        },
        {
          ...positioned(actor, at),
          id: hoseId,
          type: 'hoseSegment',
          hoseType: 'attack175',
          coupling: 'nh-1.5-female',
          startCoupling: 'nh-1.5-female',
          endCoupling: 'nh-1.5-male',
          points: [at.x, at.y, at.x + 120, at.y],
          nominalLengthFt,
          sectionCount,
          layDirection: 'attack',
          connectedFrom: { objectId: sourceObjectId, portId: 'outlet-b' },
          connectedTo: { objectId: nozzleId, portId: 'inlet' },
        },
        {
          ...positioned(actor, { x: at.x + 120, y: at.y }),
          id: nozzleId,
          type: 'nozzle',
          nozzleType: nozzle,
          coupling: 'nh-1.5-female',
          connectedTo: { objectId: hoseId, portId: 'end' },
        },
      ],
    }
  }

  const isForward = evolutionId === 'forward-lay'
  const hose: FiregroundObject = {
    ...positioned(actor, at),
    id: id('supply5'),
    type: 'hoseSegment',
    hoseType: 'supply5',
    coupling: 'storz-5',
    startCoupling: 'storz-5',
    endCoupling: 'storz-5',
    points: [at.x, at.y, at.x + 220, at.y],
    nominalLengthFt: 500,
    sectionCount: 5,
    layDirection: isForward ? 'hydrant-to-apparatus' : 'apparatus-to-hydrant',
    connectedFrom: { objectId: sourceObjectId, portId: isForward ? 'storz' : 'intake-storz' },
  }
  return { evolutionId, evolutionInstanceId: instanceId, objects: [hose] }
}
