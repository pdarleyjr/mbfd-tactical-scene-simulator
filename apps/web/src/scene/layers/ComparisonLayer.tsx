import { Circle, Group, Layer, Line, Rect, Text } from 'react-konva'
import { apparatusCatalog, type FiregroundObject } from '@mbfd/domain'

export function ComparisonLayer({ objects }: { objects: FiregroundObject[] }) {
  return <Layer listening={false} opacity={.9}>{objects.map((object) => {
    if (object.type === 'hoseSegment') return <Line key={object.id} points={object.points} stroke="#69d3e7" strokeWidth={7} dash={[14,8]} lineCap="round"/>
    if (object.type === 'apparatus') {
      const template = apparatusCatalog.find((item)=>item.id===object.apparatusTemplateId)
      if (!template) return null
      return <Group key={object.id} x={object.x} y={object.y} rotation={object.rotation}><Rect x={-template.displayWidthWorld/2-5} y={-template.displayLengthWorld/2-5} width={template.displayWidthWorld+10} height={template.displayLengthWorld+10} stroke="#69d3e7" strokeWidth={4} dash={[12,7]}/><Text x={-36} y={-8} width={72} text={`PLAN ${template.id}`} align="center" fill="#fff" stroke="#111a1f" strokeWidth={2} fontStyle="bold" fontSize={13}/></Group>
    }
    return <Group key={object.id} x={object.x} y={object.y}><Circle radius={23} stroke="#69d3e7" strokeWidth={4} dash={[8,5]}/><Text x={-34} y={27} width={68} text="PLAN" align="center" fill="#fff" fontStyle="bold" fontSize={12}/></Group>
  })}</Layer>
}
