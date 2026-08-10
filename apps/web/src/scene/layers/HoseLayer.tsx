import { Circle, Layer, Line } from 'react-konva'
import type { FiregroundObject } from '@mbfd/domain'
import { hoseStyles } from './hoseStyles'

export function HoseLayer({ objects, selectedId, onSelect }: { objects: FiregroundObject[]; selectedId?: string | undefined; onSelect: (object: FiregroundObject) => void }) {
  return <Layer>{objects.filter((object) => object.type === 'hoseSegment').map((hose) => { const style = hoseStyles[hose.hoseType]; return <Line key={hose.id} points={hose.points} stroke={style.color} strokeWidth={style.width} lineCap="round" lineJoin="round" shadowColor="#000" shadowBlur={4} shadowOpacity={.9} hitStrokeWidth={28} onClick={() => onSelect(hose)} onTap={() => onSelect(hose)} {...(selectedId === hose.id ? { dash: [14, 6] } : {})}/> })}</Layer>
}

export function HoseDraftLayer({ points, hoseType }: { points: number[]; hoseType: keyof typeof hoseStyles }) {
  if (points.length < 2) return null
  const style = hoseStyles[hoseType]
  return <Layer listening={false}><Line points={points} stroke={style.color} strokeWidth={style.width} dash={[10, 7]} lineCap="round" lineJoin="round"/><Circle x={points.at(-2)!} y={points.at(-1)!} radius={10} fill={style.color} stroke="#111a1f" strokeWidth={3}/></Layer>
}
