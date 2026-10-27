import { memo } from 'react'
import { Arrow, Circle, Group, Label, Line, Rect, Shape, Tag, Text } from 'react-konva'
import { findMarker, type ApplianceObject, type ArrowObject, type HydrantObject, type MarkerObject, type MeasurementObject, type NoteObject, type NozzleObject } from '@mbfd/domain'
import { labelAnchor, type LengthReading } from '@mbfd/fire-model'
import { ink, useInteraction } from '../interaction'
import { effectBounds } from '../effects'

const hydrantStatusColor: Record<HydrantObject['status'], string> = {
  available: ink.ok,
  'out-of-service': ink.danger,
  'low-pressure': ink.warning,
  unknown: '#8a989f',
}

/** Shared drag/selection wiring for point objects. */
function usePlacedHandlers(id: string, locked: boolean) {
  const interaction = useInteraction()
  return {
    id,
    draggable: interaction.interactive && !locked,
    onPointerDown: (event: Parameters<typeof interaction.pick>[1]) => interaction.pick(id, event),
    onDragStart: (event: Parameters<typeof interaction.dragStart>[1]) => interaction.dragStart(id, event),
    onDragMove: (event: Parameters<typeof interaction.dragMove>[1]) => interaction.dragMove(id, event),
    onDragEnd: (event: Parameters<typeof interaction.dragEnd>[1]) => interaction.dragEnd(id, event),
  }
}

export const HydrantNode = memo(function HydrantNode({ object, selected, inv, showLabel }: { object: HydrantObject; selected: boolean; inv: number; showLabel: boolean }) {
  const handlers = usePlacedHandlers(object.id, object.locked)
  const s = Math.min(Math.max(inv, 0.55), 2.6)
  return (
    <Group {...handlers} name="scene-object hydrant" x={object.x} y={object.y}>
      <Group scaleX={s} scaleY={s}>
        {selected && <Circle radius={17} fill={ink.selectSoft} stroke={ink.select} strokeWidth={2} />}
        <Circle radius={11} fill="#f6c633" stroke={ink.outline} strokeWidth={2} shadowColor="#000" shadowOpacity={0.4} shadowBlur={4} shadowEnabled={false} />
        <Circle radius={11} stroke={hydrantStatusColor[object.status]} strokeWidth={3} />
        <Rect x={-6.5} y={-2} width={13} height={4} fill={ink.outline} cornerRadius={1} listening={false} />
        <Rect x={-2} y={-6.5} width={4} height={13} fill={ink.outline} cornerRadius={1} listening={false} />
        {object.status === 'out-of-service' && <Line points={[-9, 9, 9, -9]} stroke={ink.danger} strokeWidth={3} lineCap="round" listening={false} />}
        {showLabel && (
          <Label x={14} y={-9} listening={false}>
            <Tag fill="rgba(11,16,19,0.86)" stroke="#f6c633" strokeWidth={1} cornerRadius={3} />
            <Text text={object.label} fontFamily="Barlow" fontStyle="700" fontSize={12} padding={3} fill="#f6c633" />
          </Label>
        )}
      </Group>
    </Group>
  )
})

export const WyeNode = memo(function WyeNode({ object, selected }: { object: ApplianceObject; selected: boolean }) {
  const handlers = usePlacedHandlers(object.id, object.locked)
  return (
    <Group {...handlers} name="scene-object appliance" x={object.x} y={object.y} rotation={object.rotation}>
      {selected && <Circle radius={16} fill={ink.selectSoft} stroke={ink.select} strokeWidth={2} strokeScaleEnabled={false} />}
      <Line points={[0, 10, 0, 1, -8, -9]} stroke={ink.outline} strokeWidth={6} lineCap="round" lineJoin="round" />
      <Line points={[0, 1, 8, -9]} stroke={ink.outline} strokeWidth={6} lineCap="round" />
      <Line points={[0, 10, 0, 1, -8, -9]} stroke="#d4a944" strokeWidth={3.5} lineCap="round" lineJoin="round" />
      <Line points={[0, 1, 8, -9]} stroke="#d4a944" strokeWidth={3.5} lineCap="round" />
      <Circle radius={4} fill="#d4a944" stroke={ink.outline} strokeWidth={1.5} />
    </Group>
  )
})

export const NozzleNode = memo(function NozzleNode({ object, selected }: { object: NozzleObject; selected: boolean }) {
  const handlers = usePlacedHandlers(object.id, object.locked)
  const tip = object.nozzleType === 'fog' ? 5 : 2.2
  return (
    <Group {...handlers} name="scene-object nozzle" x={object.x} y={object.y} rotation={object.rotation}>
      {selected && <Circle radius={14} fill={ink.selectSoft} stroke={ink.select} strokeWidth={2} strokeScaleEnabled={false} />}
      <Shape
        sceneFunc={(context, shape) => {
          context.beginPath()
          context.moveTo(-3.6, 6)
          context.lineTo(3.6, 6)
          context.lineTo(tip, -9)
          context.lineTo(-tip, -9)
          context.closePath()
          context.fillStrokeShape(shape)
        }}
        fill="#d9e0e3"
        stroke={ink.outline}
        strokeWidth={1.5}
      />
      {object.nozzleType === 'fog' && <Line points={[-tip - 2, -11, tip + 2, -11]} stroke="#d9e0e3" strokeWidth={1.5} lineCap="round" listening={false} />}
    </Group>
  )
})

export const MarkerNode = memo(function MarkerNode({ object, selected, inv, feetPerUnit }: { object: MarkerObject; selected: boolean; inv: number; feetPerUnit?: number | undefined }) {
  const handlers = usePlacedHandlers(object.id, object.locked)
  const definition = findMarker(object.markerType)
  const color = definition?.color ?? '#d9c8a5'
  const s = Math.min(Math.max(inv, 0.55), 2.6)
  const darkText = ['victim', 'division', 'ventilation', 'entry'].includes(object.markerType)
  const code = definition?.code ?? '?'
  const radius = object.radius
  if (definition?.effect) {
    // The flame or smoke itself is drawn by the effects layer; this is what you tap and drag.
    const reach = radius ?? 20
    const bounds = effectBounds(definition.effect, reach, object.stretch ?? 1)
    return (
      <Group {...handlers} name="scene-object marker effect-target" x={object.x} y={object.y} rotation={object.rotation}>
        {/* Selection shows as the rotate-and-stretch frame around this area. */}
        <Rect {...bounds} fill="#000" opacity={0.001} />
        {object.label && (
          <Label x={0} y={bounds.y + bounds.height + 4 * inv} rotation={-object.rotation} scaleX={s} scaleY={s} listening={false}>
            <Tag fill="rgba(11,16,19,0.86)" stroke={color} strokeWidth={1} cornerRadius={3} pointerDirection="up" pointerWidth={6} pointerHeight={4} />
            <Text text={object.label} fontFamily="Barlow" fontStyle="600" fontSize={12} padding={3} fill={ink.labelText} />
          </Label>
        )}
      </Group>
    )
  }
  return (
    <Group {...handlers} name="scene-object marker" x={object.x} y={object.y}>
      {radius && (
        <>
          <Circle radius={radius} fill={color} opacity={0.12} />
          <Circle radius={radius} stroke={color} strokeWidth={2.5} dash={[10, 6]} strokeScaleEnabled={false} />
          {selected && <Text x={-60 * inv} y={radius + 4 * inv} width={120 * inv} align="center" text={feetPerUnit ? `r ${Math.round(radius * feetPerUnit)} ft` : `r ${Math.round(radius)} u`} fontSize={12 * inv} fontFamily="Barlow" fontStyle="700" fill={color} listening={false} />}
        </>
      )}
      <Group scaleX={s} scaleY={s}>
        {selected && <Circle radius={22} fill={ink.selectSoft} stroke={ink.select} strokeWidth={2} />}
        <Circle radius={16} fill={color} stroke={ink.outline} strokeWidth={2} />
        <Text x={-16} y={-6} width={32} align="center" text={code} fontFamily="Barlow" fontStyle="700" fontSize={code.length > 3 ? 9.5 : 11.5} fill={darkText ? ink.outline : '#fff'} listening={false} />
        {object.label && (
          <Label x={0} y={19} listening={false}>
            <Tag fill="rgba(11,16,19,0.86)" stroke={color} strokeWidth={1} cornerRadius={3} pointerDirection="up" pointerWidth={6} pointerHeight={4} />
            <Text text={object.label} fontFamily="Barlow" fontStyle="600" fontSize={12} padding={3} fill={ink.labelText} />
          </Label>
        )}
      </Group>
    </Group>
  )
})

export const NoteNode = memo(function NoteNode({ object, selected, inv }: { object: NoteObject; selected: boolean; inv: number }) {
  const handlers = usePlacedHandlers(object.id, object.locked)
  const s = Math.min(Math.max(inv, 0.55), 2.6)
  return (
    <Group {...handlers} name="scene-object note" x={object.x} y={object.y}>
      <Label scaleX={s} scaleY={s}>
        <Tag fill="rgba(15,21,25,0.92)" stroke={selected ? ink.select : ink.tan} strokeWidth={selected ? 2 : 1} cornerRadius={4} shadowColor="#000" shadowBlur={6} shadowOpacity={0.35} />
        <Text text={object.text} width={Math.min(240, Math.max(60, object.text.length * 7.2 + 16))} fontFamily="Source Sans 3 Variable" fontSize={14} lineHeight={1.25} padding={7} fill={ink.labelText} wrap="word" />
      </Label>
    </Group>
  )
})

const arrowColors: Record<ArrowObject['color'], string> = { white: '#f3f1ea', yellow: '#f6c633', red: '#ff4d3d', blue: '#5cb8ff' }

export const ArrowNode = memo(function ArrowNode({ object, selected, inv }: { object: ArrowObject; selected: boolean; inv: number }) {
  const interaction = useInteraction()
  const color = arrowColors[object.color]
  return (
    <Group
      id={object.id}
      name="scene-object arrow"
      draggable={interaction.interactive && !object.locked}
      onPointerDown={(event) => interaction.pick(object.id, event)}
      onDragStart={(event) => interaction.dragStart(object.id, event)}
      onDragMove={(event) => interaction.dragMove(object.id, event)}
      onDragEnd={(event) => interaction.dragEnd(object.id, event)}
    >
      {selected && <Line points={object.points} stroke={ink.select} strokeWidth={12} opacity={0.4} lineCap="round" lineJoin="round" strokeScaleEnabled={false} />}
      <Arrow points={object.points} stroke={ink.outline} fill={ink.outline} strokeWidth={7} pointerLength={17 * inv} pointerWidth={17 * inv} lineCap="round" lineJoin="round" strokeScaleEnabled={false} opacity={0.75} />
      <Arrow points={object.points} stroke={color} fill={color} strokeWidth={4} pointerLength={14 * inv} pointerWidth={14 * inv} lineCap="round" lineJoin="round" hitStrokeWidth={22} strokeScaleEnabled={false} tension={0} />
    </Group>
  )
})

export const MeasurementNode = memo(function MeasurementNode({ object, selected, inv, reading }: { object: MeasurementObject; selected: boolean; inv: number; reading: LengthReading }) {
  const interaction = useInteraction()
  const anchor = labelAnchor(object.points)
  return (
    <Group
      id={object.id}
      name="scene-object measurement"
      draggable={interaction.interactive && !object.locked}
      onPointerDown={(event) => interaction.pick(object.id, event)}
      onDragStart={(event) => interaction.dragStart(object.id, event)}
      onDragMove={(event) => interaction.dragMove(object.id, event)}
      onDragEnd={(event) => interaction.dragEnd(object.id, event)}
    >
      <MeasureLine points={object.points} inv={inv} selected={selected} />
      <Label x={anchor.x} y={anchor.y} rotation={anchor.angle} scaleX={inv} scaleY={inv} listening={false}>
        <Tag fill="rgba(11,16,19,0.9)" stroke={reading.calibrated ? '#f3f1ea' : ink.warning} strokeWidth={1} cornerRadius={4} pointerDirection="down" pointerWidth={8} pointerHeight={5} />
        <Text text={reading.calibrated ? reading.text : `${reading.text} · uncalibrated`} fontFamily="Barlow" fontStyle="700" fontSize={13} padding={4} fill={reading.calibrated ? '#f3f1ea' : ink.warning} />
      </Label>
    </Group>
  )
})

export function MeasureLine({ points, inv, selected = false }: { points: number[]; inv: number; selected?: boolean }) {
  return (
    <>
      <Line points={points} stroke={ink.outline} strokeWidth={5} lineCap="round" lineJoin="round" strokeScaleEnabled={false} opacity={0.7} listening={false} />
      <Line points={points} stroke={selected ? ink.select : '#f3f1ea'} strokeWidth={2.5} dash={[9, 5]} lineCap="round" lineJoin="round" strokeScaleEnabled={false} hitStrokeWidth={20} />
      {points.map((_value, index) => index % 2 === 0
        ? <Circle key={index} x={points[index]!} y={points[index + 1]!} radius={3.5 * inv} fill="#f3f1ea" stroke={ink.outline} strokeWidth={1} strokeScaleEnabled={false} listening={false} />
        : null)}
    </>
  )
}
