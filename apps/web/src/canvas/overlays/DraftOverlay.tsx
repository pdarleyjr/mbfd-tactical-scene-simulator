import { Arrow, Circle, Group, Label, Line, Tag, Text } from 'react-konva'
import { hoseCatalog } from '@mbfd/domain'
import { apparatusSize, eligiblePorts, findPort, pointAt, pointCount, polylineLength, readLength, startRuleAccepts, type SnapTarget, type Vec } from '@mbfd/fire-model'
import { useMemo } from 'react'
import { sceneContext, useBoard } from '../../store/board'
import { useUi } from '../../store/ui'
import { currentHoseSpec, entrySnapAt, hoseSnapAt } from '../drafting'
import { ink } from '../interaction'
import { ApparatusNode } from '../nodes/ApparatusNode'
import { MeasureLine } from '../nodes/SymbolNodes'

/** Live previews for drawing and placement tools. */
export function DraftOverlay({ inv, fontPx = 16 }: { inv: number; fontPx?: number }) {
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
  // An attack line routed past a building entry point goes through the door.
  const entry: Vec | undefined = tool === 'hose' && cursor && !snap ? entrySnapAt(cursor, draft) : undefined
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
  const tip = snap ?? entry ?? cursor
  const preview = tip && points.length >= 2 ? [...points, tip.x, tip.y] : points
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
      {/* Every coupling this line can connect to, so you can see where to tap before you get there. */}
      {eligible.map((target) => (
        <Group key={`${target.objectId}:${target.portId}`} name="connect-target">
          <Circle x={target.x} y={target.y} radius={12 * inv} stroke={ink.outline} strokeWidth={5} strokeScaleEnabled={false} opacity={0.7} />
          <Circle x={target.x} y={target.y} radius={12 * inv} stroke={ink.ok} strokeWidth={2.5} dash={[5, 3]} strokeScaleEnabled={false} fill="rgba(76,195,138,0.22)" />
        </Group>
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
      {snap && <Circle x={snap.x} y={snap.y} radius={20 * inv} stroke={ink.ok} strokeWidth={3.5} strokeScaleEnabled={false} fill="rgba(76,195,138,0.32)" name="snap-ring" />}
      {snap && (
        <Label x={snap.x} y={snap.y - 24 * inv} scaleX={inv} scaleY={inv}>
          <Tag fill="#0b1013" stroke={ink.ok} strokeWidth={2} cornerRadius={5} pointerDirection="down" pointerWidth={10} pointerHeight={6} />
          <Text text={`Connect: ${snap.port.label}`} fontFamily="Barlow" fontStyle="700" fontSize={fontPx - 1} padding={Math.round(fontPx * 0.3)} fill={ink.ok} />
        </Label>
      )}
      {entry && <Circle x={entry.x} y={entry.y} radius={18 * inv} stroke={ink.warning} strokeWidth={3} strokeScaleEnabled={false} fill="rgba(255,176,32,0.25)" name="entry-ring" />}
      {entry && (
        <Label x={entry.x} y={entry.y - 22 * inv} scaleX={inv} scaleY={inv}>
          <Tag fill="#0b1013" stroke={ink.warning} strokeWidth={2} cornerRadius={5} pointerDirection="down" pointerWidth={10} pointerHeight={6} />
          <Text text="Through entry point" fontFamily="Barlow" fontStyle="700" fontSize={fontPx - 1} padding={Math.round(fontPx * 0.3)} fill={ink.warning} />
        </Label>
      )}
      {end && preview.length >= 4 && (
        <Label x={end.x + 16 * inv} y={end.y + 16 * inv} scaleX={inv} scaleY={inv}>
          <Tag fill="#0b1013" stroke={over ? ink.warning : length.calibrated ? color : ink.warning} strokeWidth={fontPx >= 22 ? 3 : 2} cornerRadius={6} />
          <Text text={`${length.text}${step ? ` / ${step.loadFt} ft load` : ''}`} fontFamily="Barlow" fontStyle="700" fontSize={fontPx + 2} padding={Math.round(fontPx * 0.35)} fill={over ? ink.warning : '#ffffff'} />
        </Label>
      )}
    </Group>
  )
}
