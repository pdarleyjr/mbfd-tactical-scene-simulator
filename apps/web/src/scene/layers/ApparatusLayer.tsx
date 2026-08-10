import { useEffect, useRef } from 'react'
import { Group, Image, Layer, Rect, Text, Transformer } from 'react-konva'
import type Konva from 'konva'
import type { FiregroundObject } from '@mbfd/domain'
import { apparatusCatalog } from '@mbfd/domain'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useImage } from '../useImage'

function ApparatusNode(props: { object: Extract<FiregroundObject, { type: 'apparatus' }>; selected: boolean; canMove: boolean; onSelect: () => void; onTransform: (x: number, y: number, rotation: number) => void }) {
  const template = apparatusCatalog.find((item) => item.id === props.object.apparatusTemplateId)
  const image = useImage(template?.assetPath)
  const nodeRef = useRef<Konva.Group>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  useEffect(() => {
    const node = nodeRef.current
    const transformer = transformerRef.current
    if (props.selected && props.canMove && node && transformer) { transformer.nodes([node]); transformer.getLayer()?.batchDraw() }
  }, [props.canMove, props.selected])
  if (!template) return null
  function finish(event: KonvaEventObject<DragEvent | Event>) {
    const node = event.target as Konva.Group
    node.scale({ x: 1, y: 1 })
    props.onTransform(node.x(), node.y(), ((node.rotation() % 360) + 360) % 360)
  }
  return <>
    <Group ref={nodeRef} x={props.object.x} y={props.object.y} rotation={props.object.rotation} draggable={props.canMove && !props.object.locked} onClick={props.onSelect} onTap={props.onSelect} onDragEnd={finish} onTransformEnd={finish}>
      {props.selected && <Rect x={-template.displayWidthWorld / 2 - 5} y={-template.displayLengthWorld / 2 - 5} width={template.displayWidthWorld + 10} height={template.displayLengthWorld + 10} stroke="#57a8df" strokeWidth={3} dash={[8,4]}/>}
      <Image image={image} x={-template.displayWidthWorld / 2} y={-template.displayLengthWorld / 2} width={template.displayWidthWorld} height={template.displayLengthWorld}/>
      <Rect x={-23} y={template.displayLengthWorld / 2 + 4} width={46} height={18} fill="#111a1f" stroke="#d9c8a5" strokeWidth={1}/>
      <Text x={-23} y={template.displayLengthWorld / 2 + 6} width={46} text={template.id} align="center" fontFamily="Barlow" fontStyle="bold" fontSize={12} fill="#f4ecd9"/>
    </Group>
    {props.selected && props.canMove && <Transformer ref={transformerRef} enabledAnchors={[]} rotateEnabled rotateAnchorOffset={48} anchorSize={22} anchorCornerRadius={11} anchorFill="#57a8df" anchorStroke="#f4ecd9" borderStroke="#57a8df" borderDash={[8, 4]} flipEnabled={false}/>}
  </>
}

export function ApparatusLayer({ objects, selectedId, canMove, onSelect, onTransform }: { objects: FiregroundObject[]; selectedId?: string | undefined; canMove: (object: FiregroundObject) => boolean; onSelect: (object: FiregroundObject) => void; onTransform: (object: Extract<FiregroundObject, { type: 'apparatus' }>, x: number, y: number, rotation: number) => void }) {
  return <Layer>{objects.filter((object): object is Extract<FiregroundObject, { type: 'apparatus' }> => object.type === 'apparatus').map((object) => <ApparatusNode key={object.id} object={object} selected={selectedId === object.id} canMove={canMove(object)} onSelect={() => onSelect(object)} onTransform={(x, y, rotation) => onTransform(object, x, y, rotation)}/>)}</Layer>
}
