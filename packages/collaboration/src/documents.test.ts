import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { FiregroundObject } from '@mbfd/domain'
import { collectionForObject, documentSnapshot, ensureTacticalDocument, freezeDocument, listFiregroundObjects, putFiregroundObject, tacticalCollections } from './documents.js'

const base = { x: 1, y: 2, rotation: 0, locked: false, createdByClientId: 'client', createdByName: 'Smith', createdByUnit: 'E1', createdAt: '2026-08-07T12:00:00.000Z', updatedAt: '2026-08-07T12:00:00.000Z' }

describe('tactical Yjs documents', () => {
  it('routes every fireground object type into a stable semantic collection', () => {
    const objects: FiregroundObject[] = [
      { ...base, id: 'a', type: 'apparatus', apparatusTemplateId: 'E1', scale: 1, status: 'positioned', connectionPoints: [] },
      { ...base, id: 'h', type: 'hoseSegment', hoseType: 'attack175', coupling: 'nh-1.5-female', startCoupling: 'nh-1.5-female', endCoupling: 'nh-1.5-male', points: [0,0,1,1], nominalLengthFt: 100, sectionCount: 1, layDirection: 'attack' },
      { ...base, id: 'b', type: 'hoseBundle', bundleType: 'jumpline', hoseType: 'attack175', sectionCount: 1, nominalLengthFt: 100, selectedNozzle: 'fog', deployedSegmentIds: [] },
      { ...base, id: 'w', type: 'appliance', applianceType: 'gated-wye', connectionPoints: [{id:'inlet',label:'Inlet',coupling:'nh-2.5-female',direction:'inlet',x:0,y:0},{id:'a',label:'A',coupling:'nh-1.5-male',direction:'outlet',x:1,y:0},{id:'b',label:'B',coupling:'nh-1.5-male',direction:'outlet',x:1,y:1}] },
      { ...base, id: 'n', type: 'nozzle', nozzleType: 'fog', coupling: 'nh-1.5-female' },
      { ...base, id: 'y', type: 'hydrant', label: 'Hydrant', status: 'unknown', connectionPoints: [{id:'s',label:'Storz',coupling:'storz-5',direction:'outlet',x:0,y:0}] },
      { ...base, id: 't', type: 'annotation', text: 'Side Alpha' },
      { ...base, id: 'm', type: 'tacticalMarker', markerType: 'entry', label: 'Entry' },
    ]
    const document = new Y.Doc()
    objects.forEach((object) => putFiregroundObject(document, object))
    expect(listFiregroundObjects(document)).toHaveLength(objects.length)
    expect(objects.map(collectionForObject)).toEqual(['apparatus','hoseSegments','hoseBundles','appliances','nozzles','hydrants','annotations','markers'])
    expect(Object.keys(documentSnapshot(document))).toEqual(tacticalCollections)
    expect(freezeDocument(document)).toBeInstanceOf(Uint8Array)
  })

  it('creates all maps idempotently and never exposes evolution metadata as a fireground object', () => {
    const document = new Y.Doc(); ensureTacticalDocument(document); ensureTacticalDocument(document)
    document.getMap('evolutionInstances').set('one', { id: 'one' })
    expect(listFiregroundObjects(document)).toEqual([])
  })
})
