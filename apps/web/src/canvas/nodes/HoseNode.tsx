import { memo, useContext, useEffect, useRef } from 'react'
import { Circle, Group, Label, Line, Tag, Text } from 'react-konva'
import type Konva from 'konva'
import { hoseCatalog, type HoseObject } from '@mbfd/domain'
import { labelAnchor, type HoseReading, type LineState } from '@mbfd/fire-model'
import { FlowContext, ink, useInteraction } from '../interaction'

interface Props {
  hose: HoseObject
  reading: HoseReading
  state: LineState
  selected: boolean
  inv: number
  showLength: boolean
  showFlow: boolean
  dimmed?: boolean
}

export const HoseNode = memo(function HoseNode({ hose, reading, state, selected, inv, showLength, showFlow, dimmed }: Props) {
  const definition = hoseCatalog[hose.hoseType]
  const interaction = useInteraction()
  const flow = useContext(FlowContext)
  const flowRef = useRef<Konva.Line>(null)
  const animated = showFlow && state !== 'dry'
  useEffect(() => {
    if (!animated || !flowRef.current || !flow) return
    return flow.register(flowRef.current)
  }, [animated, flow])

  const width = definition.width
  const points = hose.points
  const last = points.length - 2
  const anchor = labelAnchor(points)
  const over = reading.overLoadFt !== undefined
  const lengthText = `${definition.shortLabel} · ${reading.length.text}${reading.sections ? ` · ${reading.sections} sec` : ''}`
  return (
    <Group id={hose.id} name="scene-object hose" opacity={dimmed ? 0.35 : 1} onPointerDown={(event) => interaction.pick(hose.id, event)}>
      {selected && <Line points={points} stroke={ink.select} strokeWidth={width + 10} lineCap="round" lineJoin="round" strokeScaleEnabled={false} opacity={0.45} listening={false} />}
      <Line points={points} stroke={ink.outline} strokeWidth={width + 3.5} lineCap="round" lineJoin="round" strokeScaleEnabled={false} opacity={0.85} listening={false} perfectDrawEnabled={false} />
      <Line
        points={points}
        stroke={definition.color}
        strokeWidth={width}
        lineCap="round"
        lineJoin="round"
        strokeScaleEnabled={false}
        hitStrokeWidth={24}
        perfectDrawEnabled={false}
        listening={interaction.interactive}
      />
      {animated && (
        <Line
          ref={flowRef}
          points={points}
          stroke={state === 'hydrant' ? 'rgba(20,60,110,0.85)' : 'rgba(20,60,110,0.45)'}
          strokeWidth={Math.max(1.6, width * 0.38)}
          dash={state === 'hydrant' ? [width * 1.4, width * 1.8] : [width * 0.9, width * 3.4]}
          lineCap="round"
          strokeScaleEnabled={false}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      <Coupling x={points[0]!} y={points[1]!} connected={Boolean(hose.from)} color={definition.color} inv={inv} />
      <Coupling x={points[last]!} y={points[last + 1]!} connected={Boolean(hose.to)} color={definition.color} inv={inv} />
      {showLength && (
        <Label x={anchor.x} y={anchor.y} rotation={anchor.angle} scaleX={inv} scaleY={inv} listening={false}>
          <Tag fill={over ? '#3a2606' : 'rgba(11,16,19,0.86)'} stroke={over ? ink.warning : definition.color} strokeWidth={1} cornerRadius={4} pointerDirection="down" pointerWidth={8} pointerHeight={5} />
          <Text text={over ? `${lengthText} · over load` : lengthText} fontFamily="Barlow" fontStyle="600" fontSize={12} padding={4} fill={over ? ink.warning : reading.length.calibrated ? ink.labelText : '#e8d9b5'} />
        </Label>
      )}
    </Group>
  )
})

function Coupling({ x, y, connected, color, inv }: { x: number; y: number; connected: boolean; color: string; inv: number }) {
  return connected
    ? <Circle x={x} y={y} radius={3.6 * inv} fill={ink.outline} stroke={color} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
    : <Circle x={x} y={y} radius={5 * inv} fill="rgba(11,16,19,0.6)" stroke={color} strokeWidth={2} strokeScaleEnabled={false} dash={[3, 2]} listening={false} />
}
