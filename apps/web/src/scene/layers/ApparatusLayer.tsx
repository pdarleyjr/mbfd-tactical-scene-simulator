import { Group, Image, Layer, Rect, Text } from 'react-konva'
import type { FiregroundObject } from '@mbfd/domain'
import { apparatusCatalog } from '@mbfd/domain'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useImage } from '../useImage'

function ApparatusNode({ object, selected, canMove, onSelect, onMove }: { object: Extract<FiregroundObject, { type: 'apparatus' }>; selected: boolean; canMove: boolean; onSelect: () => void; onMove: (x: number, y: number) => void }) {
  const template = apparatusCatalog.find((item) => item.id === object.apparatusTemplateId)
  const image = useImage(template?.assetPath)
  if (!template) return null
  return <Group x={object.x} y={object.y} rotation={object.rotation} draggable={canMove && !object.locked} onClick={onSelect} onTap={onSelect} onDragEnd={(event: KonvaEventObject<DragEvent>) => onMove(event.target.x(), event.target.y())}>
    {selected && <Rect x={-template.displayWidthWorld / 2 - 5} y={-template.displayLengthWorld / 2 - 5} width={template.displayWidthWorld + 10} height={template.displayLengthWorld + 10} stroke="#57a8df" strokeWidth={3} dash={[8,4]} />}
    <Image image={image} x={-template.displayWidthWorld / 2} y={-template.displayLengthWorld / 2} width={template.displayWidthWorld} height={template.displayLengthWorld} />
    <Rect x={-23} y={template.displayLengthWorld / 2 + 4} width={46} height={18} fill="#111a1f" stroke="#d9c8a5" strokeWidth={1} />
    <Text x={-23} y={template.displayLengthWorld / 2 + 6} width={46} text={template.id} align="center" fontFamily="Barlow" fontStyle="bold" fontSize={12} fill="#f4ecd9" />
  </Group>
}

export function ApparatusLayer({ objects, selectedId, canMove, onSelect, onMove }: { objects: FiregroundObject[]; selectedId?: string | undefined; canMove: (object: FiregroundObject) => boolean; onSelect: (object: FiregroundObject) => void; onMove: (object: FiregroundObject, x: number, y: number) => void }) {
  return <Layer>{objects.filter((object): object is Extract<FiregroundObject, { type: 'apparatus' }> => object.type === 'apparatus').map((object) => <ApparatusNode key={object.id} object={object} selected={selectedId === object.id} canMove={canMove(object)} onSelect={() => onSelect(object)} onMove={(x,y) => onMove(object,x,y)} />)}</Layer>
}
