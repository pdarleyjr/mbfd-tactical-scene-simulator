import { memo, useContext, useEffect, useRef } from 'react'
import { Circle, Group, Line } from 'react-konva'
import type Konva from 'konva'
import { hoseCatalog, type HoseObject } from '@mbfd/domain'
import type { HoseReading, LineState } from '@mbfd/fire-model'
import { FlowContext, ink, useInteraction } from '../interaction'

interface Props {
  hose: HoseObject
  /** Part of the props so the line redraws when its reading changes (calibration, loads). */
  reading: HoseReading
  state: LineState
  selected: boolean
  inv: number
  showFlow: boolean
  /** Stroke multiplier: 1.6 on 4K panels at 100% scaling, so lines keep their weight next to the enlarged chrome. */
  lineScale?: number
  dimmed?: boolean
}

/** One hose line. Its length label is drawn by HoseLengthLabels, which keeps labels clear of each other. */
export const HoseNode = memo(function HoseNode({ hose, state, selected, inv, showFlow, dimmed, lineScale = 1 }: Props) {
  const definition = hoseCatalog[hose.hoseType]
  const interaction = useInteraction()
  const flow = useContext(FlowContext)
  const flowRef = useRef<Konva.Line>(null)
  const animated = showFlow && state !== 'dry'
  useEffect(() => {
    if (!animated || !flowRef.current || !flow) return
    return flow.register(flowRef.current)
  }, [animated, flow])

  const width = definition.width * lineScale
  const points = hose.points
  const last = points.length - 2
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
        hitStrokeWidth={28}
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
      <Coupling x={points[0]!} y={points[1]!} connected={Boolean(hose.from)} color={definition.color} inv={inv * lineScale} />
      <Coupling x={points[last]!} y={points[last + 1]!} connected={Boolean(hose.to)} color={definition.color} inv={inv * lineScale} />
    </Group>
  )
})

function Coupling({ x, y, connected, color, inv }: { x: number; y: number; connected: boolean; color: string; inv: number }) {
  return connected
    ? <Circle x={x} y={y} radius={3.6 * inv} fill={ink.outline} stroke={color} strokeWidth={1.5} strokeScaleEnabled={false} listening={false} />
    : <Circle x={x} y={y} radius={5 * inv} fill="rgba(11,16,19,0.6)" stroke={color} strokeWidth={2} strokeScaleEnabled={false} dash={[3, 2]} listening={false} />
}
