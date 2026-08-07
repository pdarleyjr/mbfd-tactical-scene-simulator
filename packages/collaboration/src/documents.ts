import * as Y from 'yjs'
import type { FiregroundObject } from '@mbfd/domain'

export const tacticalCollections = [
  'apparatus',
  'hoseSegments',
  'hoseBundles',
  'appliances',
  'nozzles',
  'hydrants',
  'annotations',
  'markers',
  'evolutionInstances',
] as const

export type TacticalCollection = (typeof tacticalCollections)[number]

export function collectionForObject(object: FiregroundObject): TacticalCollection {
  switch (object.type) {
    case 'apparatus': return 'apparatus'
    case 'hoseSegment': return 'hoseSegments'
    case 'hoseBundle': return 'hoseBundles'
    case 'appliance': return 'appliances'
    case 'nozzle': return 'nozzles'
    case 'hydrant': return 'hydrants'
    case 'annotation': return 'annotations'
    case 'tacticalMarker': return 'markers'
  }
}

export function ensureTacticalDocument(document: Y.Doc): void {
  for (const collection of tacticalCollections) document.getMap(collection)
  document.getMap('meta')
}

export function putFiregroundObject(document: Y.Doc, object: FiregroundObject): void {
  ensureTacticalDocument(document)
  document.transact(() => {
    document.getMap<FiregroundObject>(collectionForObject(object)).set(object.id, object)
  }, 'semantic-object-put')
}

export function listFiregroundObjects(document: Y.Doc): FiregroundObject[] {
  ensureTacticalDocument(document)
  return tacticalCollections.flatMap((collection) => {
    if (collection === 'evolutionInstances') return []
    return [...document.getMap<FiregroundObject>(collection).values()]
  })
}

export function documentSnapshot(document: Y.Doc): Record<TacticalCollection, Record<string, unknown>> {
  ensureTacticalDocument(document)
  return Object.fromEntries(
    tacticalCollections.map((collection) => [collection, document.getMap(collection).toJSON()]),
  ) as Record<TacticalCollection, Record<string, unknown>>
}

export function freezeDocument(document: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(document)
}
