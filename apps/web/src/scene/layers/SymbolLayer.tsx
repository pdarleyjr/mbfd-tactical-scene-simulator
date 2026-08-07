import { Circle, Group, Layer, Rect, Text } from 'react-konva'
import type { FiregroundObject } from '@mbfd/domain'
import type { KonvaEventObject } from 'konva/lib/Node'

function Symbol({ object, selected, canMove, onSelect, onMove }: { object: Exclude<FiregroundObject, { type: 'apparatus' | 'hoseSegment' }>; selected: boolean; canMove: boolean; onSelect: () => void; onMove: (x: number, y: number) => void }) {
  const label = object.type === 'hydrant' ? 'H' : object.type === 'appliance' ? 'WY' : object.type === 'nozzle' ? 'NZ' : object.type === 'hoseBundle' ? 'PK' : object.type === 'annotation' ? object.text : object.label || object.markerType
  const fill = object.type === 'hydrant' ? '#4d8fc1' : object.type === 'tacticalMarker' && object.markerType === 'hazard' ? '#be241f' : '#d49c33'
  const wide = object.type === 'annotation'
  return <Group x={object.x} y={object.y} rotation={object.rotation} draggable={canMove && !object.locked} onClick={onSelect} onTap={onSelect} onDragEnd={(event: KonvaEventObject<DragEvent>) => onMove(event.target.x(), event.target.y())}>
    {wide ? <><Rect x={-60} y={-18} width={120} height={36} fill="#111a1f" stroke={selected ? '#57a8df' : '#d9c8a5'} strokeWidth={selected ? 3 : 1}/><Text x={-54} y={-10} width={108} text={label} align="center" fill="#f4ecd9" fontSize={14}/></> : <><Circle radius={selected ? 20 : 17} fill={fill} stroke={selected ? '#57a8df' : '#f4ecd9'} strokeWidth={selected ? 4 : 2}/><Text x={-18} y={-7} width={36} text={label} align="center" fill="#fff" fontStyle="bold" fontSize={11}/></>}
  </Group>
}

export function SymbolLayer({ objects, selectedId, canMove, onSelect, onMove }: { objects: FiregroundObject[]; selectedId?: string | undefined; canMove: (object: FiregroundObject) => boolean; onSelect: (object: FiregroundObject) => void; onMove: (object: FiregroundObject, x: number, y: number) => void }) {
  const symbols = objects.filter((object): object is Exclude<FiregroundObject, { type: 'apparatus' | 'hoseSegment' }> => object.type !== 'apparatus' && object.type !== 'hoseSegment')
  return <Layer>{symbols.map((object) => <Symbol key={object.id} object={object} selected={selectedId === object.id} canMove={canMove(object)} onSelect={() => onSelect(object)} onMove={(x,y) => onMove(object,x,y)} />)}</Layer>
}
