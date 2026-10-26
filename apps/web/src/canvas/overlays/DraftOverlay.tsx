import { Arrow, Circle, Group, Label, Line, Tag, Text } from 'react-konva'
import { hoseCatalog } from '@mbfd/domain'
import { apparatusSize, eligiblePorts, findPort, pointAt, pointCount, polylineLength, readLength, startRuleAccepts, type SnapTarget, type Vec } from '@mbfd/fire-model'
import { useMemo } from 'react'
import { sceneContext, useBoard } from '../../store/board'
import { useUi } from '../../store/ui'
import { currentHoseSpec, hoseSnapAt } from '../drafting'
import { ink } from '../interaction'
import { ApparatusNode } from '../nodes/ApparatusNode'
import { MeasureLine } from '../nodes/SymbolNodes'

/** Live previews for drawing and placement tools. */
export function DraftOverlay({ inv }: { inv: number }) {
  const tool = useUi((state) => state.tool)
  const draft = useUi((state) => state.draft)
  const cursor = useUi((state) => state.cursor)
  const template = useUi((state) => state.apparatusTemplate)
  const rotation = useUi((state) => (template ? state.lastRotation[template] : 0) ?? 0)
  const hoseChoice = useUi((state) => state.hoseChoice)
  const arrowColor = useUi((state) => state.arrowColor)
  const objects = useBoard((state) => state.board.objects)
  const scenario = useBoard((state) => state.board.scenario)
  const context = useMemo(() => sceneContext(scenario), [scenario])

  const snap: SnapTarget | undefined = tool === 'hose' && cursor ? hoseSnapAt(cursor, draft) : undefined
  const eligible = useMemo(() => {
    if (tool !== 'hose') return []
    const spec = currentHoseSpec(draft)
    const starting = !draft || draft.points.length === 0
    const fromObject = draft?.from ? objects.find((object) => object.id === draft.from!.objectId) : undefined
    const fromPort = fromObject && draft?.from ? findPort(fromObject, draft.from.portId, context) : undefined
    return eligiblePorts(objects, {
      hoseType: spec.hoseType,
      context,
      otherEndDirection: starting ? undefined : fromPort?.direction,
      excludeHoseId: draft?.continueHoseId,
      ...(starting && spec.step ? { accept: (object, port) => startRuleAccepts(spec.step!.start, object, port) } : {}),
    })
    // hoseChoice changes the spec even when the draft does not.
  }, [tool, draft, objects, context, hoseChoice]) // oxlint-disable-line react-hooks/exhaustive-deps

  if (tool === 'apparatus' && template && cursor && !draft) {
    const size = apparatusSize(template, context)
    const ghost = { id: 'ghost', type: 'apparatus' as const, templateId: template, label: template, assignment: '', x: cursor.x, y: cursor.y, rotation, locked: false }
    return <Group listening={false}><ApparatusNode object={ghost} size={size} selected={false} inv={inv} ghost /></Group>
  }

  const points = draft?.points ?? []
  const preview = cursor && points.length >= 2 ? [...points, snap?.x ?? cursor.x, snap?.y ?? cursor.y] : points
  const hoseType = tool === 'hose' ? currentHoseSpec(draft).hoseType : undefined
  const color = hoseType ? hoseCatalog[hoseType].color : tool === 'arrow' ? ({ white: '#f3f1ea', yellow: '#f6c633', red: '#ff4d3d', blue: '#5cb8ff' })[arrowColor] : '#f3f1ea'
  const length = readLength(polylineLength(preview), scenario.calibration)
  const end: Vec | undefined = preview.length >= 2 ? pointAt(preview, pointCount(preview) - 1) : undefined
  const step = tool === 'hose' ? currentHoseSpec(draft).step : undefined
  const over = step && length.feet !== undefined && length.feet > step.loadFt

  return (
    <Group listening={false}>
      {tool === 'calibrate' && scenario.calibration && !draft && (
        <Group opacity={0.7}>
          <MeasureLine points={[scenario.calibration.a.x, scenario.calibration.a.y, scenario.calibration.b.x, scenario.calibration.b.y]} inv={inv} />
        </Group>
      )}
      {eligible.map((target) => (
        <Circle key={`${target.objectId}:${target.portId}`} x={target.x} y={target.y} radius={9 * inv} stroke={ink.ok} strokeWidth={2} dash={[4, 3]} strokeScaleEnabled={false} fill="rgba(76,195,138,0.12)" />
      ))}
      {preview.length >= 4 && tool === 'hose' && (
        <>
          <Line points={preview} stroke={ink.outline} strokeWidth={hoseCatalog[hoseType!].width + 3.5} lineCap="round" lineJoin="round" strokeScaleEnabled={false} opacity={0.8} />
          <Line points={preview} stroke={color} strokeWidth={hoseCatalog[hoseType!].width} lineCap="round" lineJoin="round" strokeScaleEnabled={false} dash={[14, 6]} />
        </>
      )}
      {preview.length >= 4 && tool === 'arrow' && <Arrow points={preview} stroke={color} fill={color} strokeWidth={4} pointerLength={14 * inv} pointerWidth={14 * inv} strokeScaleEnabled={false} dash={[12, 6]} />}
      {preview.length >= 4 && (tool === 'measure' || tool === 'calibrate') && <MeasureLine points={preview} inv={inv} />}
      {points.length >= 2 && <Circle x={points[0]!} y={points[1]!} radius={5 * inv} fill={color} stroke={ink.outline} strokeWidth={1.5} strokeScaleEnabled={false} />}
      {snap && <Circle x={snap.x} y={snap.y} radius={17 * inv} stroke={ink.ok} strokeWidth={3} strokeScaleEnabled={false} fill="rgba(76,195,138,0.28)" />}
      {snap && (
        <Label x={snap.x} y={snap.y - 20 * inv} scaleX={inv} scaleY={inv}>
          <Tag fill="rgba(11,16,19,0.9)" stroke={ink.ok} strokeWidth={1} cornerRadius={3} pointerDirection="down" pointerWidth={8} pointerHeight={5} />
          <Text text={snap.port.label} fontFamily="Barlow" fontStyle="700" fontSize={12} padding={4} fill={ink.ok} />
        </Label>
      )}
      {end && preview.length >= 4 && (
        <Label x={end.x + 14 * inv} y={end.y + 14 * inv} scaleX={inv} scaleY={inv}>
          <Tag fill="rgba(11,16,19,0.92)" stroke={over ? ink.warning : length.calibrated ? '#f3f1ea' : ink.warning} strokeWidth={1} cornerRadius={4} />
          <Text text={`${length.text}${step ? ` / ${step.loadFt} ft load` : ''}`} fontFamily="Barlow" fontStyle="700" fontSize={14} padding={5} fill={over ? ink.warning : '#f3f1ea'} />
        </Label>
      )}
    </Group>
  )
}
