import { Circle, Layer, Line } from 'react-konva'
import type { FiregroundObject } from '@mbfd/domain'
import { hoseStyles } from './hoseStyles'

export function HoseLayer({ objects, selectedId, onSelect }: { objects: FiregroundObject[]; selectedId?: string | undefined; onSelect: (object: FiregroundObject) => void }) {
  return <Layer>{objects.filter((object) => object.type === 'hoseSegment').map((hose) => { const style = hoseStyles[hose.hoseType]; return <Line key={hose.id} points={hose.points} stroke={style.color} strokeWidth={style.width} lineCap="round" lineJoin="round" shadowColor="#000" shadowBlur={4} shadowOpacity={.9} hitStrokeWidth={28} onClick={() => onSelect(hose)} onTap={() => onSelect(hose)} {...(selectedId === hose.id ? { dash: [14, 6] } : {})}/> })}</Layer>
}

export function HoseDraftLayer({ points, hoseType }: { points: number[]; hoseType: keyof typeof hoseStyles }) {
  if (points.length < 2) return null
  const style = hoseStyles[hoseType]
  const vertices = Array.from({ length: points.length / 2 }, (_item, index) => ({ x: points[index * 2]!, y: points[index * 2 + 1]! }))
  return <Layer listening={false}><Line points={points} stroke={style.color} strokeWidth={style.width} lineCap="round" lineJoin="round" shadowColor="#000" shadowBlur={3}/>{vertices.map((point, index) => <Circle key={`${point.x}-${point.y}-${index}`} x={point.x} y={point.y} radius={index === vertices.length - 1 ? 11 : 7} fill={style.color} stroke="#111a1f" strokeWidth={3}/>)}</Layer>
}
