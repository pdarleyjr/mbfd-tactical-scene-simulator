import { Circle, Layer, Line } from 'react-konva'
import type { FiregroundObject } from '@mbfd/domain'

const hoseColors = { attack175: '#f0d65b', hose3: '#62aee3', supply5: '#f1eee1' }

export function HoseLayer({ objects, selectedId, onSelect }: { objects: FiregroundObject[]; selectedId?: string | undefined; onSelect: (object: FiregroundObject) => void }) {
  return <Layer>{objects.filter((object) => object.type === 'hoseSegment').map((hose) => <Line key={hose.id} points={hose.points} stroke={hoseColors[hose.hoseType]} strokeWidth={hose.hoseType === 'supply5' ? 9 : hose.hoseType === 'hose3' ? 7 : 5} lineCap="round" lineJoin="round" shadowColor="#000" shadowBlur={3} shadowOpacity={.8} hitStrokeWidth={24} onClick={() => onSelect(hose)} onTap={() => onSelect(hose)} {...(selectedId === hose.id ? { dash: [14, 6] } : {})} />)}</Layer>
}

export function HoseDraftLayer({ points }: { points: number[] }) {
  if (points.length < 2) return null
  return <Layer listening={false}><Line points={points} stroke="#f0d65b" strokeWidth={5} dash={[10, 7]} lineCap="round" /><Circle x={points.at(-2)!} y={points.at(-1)!} radius={8} stroke="#57a8df" strokeWidth={3} /></Layer>
}
