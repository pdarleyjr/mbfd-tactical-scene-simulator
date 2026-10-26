import { useRef, useState } from 'react'
import { Circle, Group, Text } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { HoseObject, MarkerObject, PathObject, SceneObject } from '@mbfd/domain'
import { distance, findPort, findSnapTarget, pointAt, pointCount, type SnapTarget } from '@mbfd/fire-model'
import { sceneContext, useBoard } from '../../store/board'
import { useUi } from '../../store/ui'
import { ink } from '../interaction'

type ActiveDrag = { key: string; index: number; endpoint?: 'from' | 'to' | undefined }

function replacePoint(points: readonly number[], index: number, x: number, y: number): number[] {
  const next = [...points]
  next[index * 2] = x
  next[index * 2 + 1] = y
  return next
}

/**
 * Vertex handles for the selected line: drag a point to reroute, drag a "+"
 * to add a bend, double-tap a bend to remove it, and drag an end onto a port
 * to connect (or away from one to disconnect).
 */
export function PathHandles({ object, inv }: { object: PathObject; inv: number }) {
  const [active, setActive] = useState<ActiveDrag | null>(null)
  const [snap, setSnap] = useState<SnapTarget | null>(null)
  // The drop reads the latest snap from a ref; state may lag a fast release.
  const snapRef = useRef<SnapTarget | null>(null)
  if (object.locked) return null
  const count = pointCount(object.points)
  const isHose = object.type === 'hose'

  function update(mutator: (target: PathObject) => PathObject) {
    useBoard.getState().setTransient((objects) => objects.map((candidate) => candidate.id === object.id ? mutator(candidate as PathObject) : candidate))
  }

  function otherEndDirection(hose: HoseObject, end: 'from' | 'to') {
    const reference = end === 'from' ? hose.to : hose.from
    if (!reference) return undefined
    const { board } = useBoard.getState()
    const target = board.objects.find((candidate) => candidate.id === reference.objectId)
    return target ? findPort(target, reference.portId, sceneContext(board.scenario))?.direction : undefined
  }

  function vertexDragMove(index: number, endpoint: 'from' | 'to' | undefined, event: KonvaEventObject<DragEvent>) {
    let { x, y } = event.target.position()
    let found: SnapTarget | undefined
    if (isHose && endpoint) {
      const { board } = useBoard.getState()
      const hose = board.objects.find((candidate) => candidate.id === object.id) as HoseObject | undefined
      if (hose) {
        found = findSnapTarget(board.objects, { hoseType: hose.hoseType, point: { x, y }, radius: 30 * inv, context: sceneContext(board.scenario), otherEndDirection: otherEndDirection(hose, endpoint), excludeHoseId: hose.id })
        if (found) { x = found.x; y = found.y; event.target.position({ x, y }) }
      }
    }
    snapRef.current = found ?? null
    setSnap(found ?? null)
    update((target) => {
      const moved = { ...target, points: replacePoint(target.points, index, x, y) } as PathObject
      if (moved.type !== 'hose' || !endpoint) return moved
      const { [endpoint]: _released, ...rest } = moved
      return rest as PathObject
    })
  }

  function vertexDragEnd(endpoint: 'from' | 'to' | undefined) {
    const store = useBoard.getState()
    const snap = snapRef.current
    if (isHose && endpoint && snap) {
      const reference = { objectId: snap.objectId, portId: snap.portId }
      store.setTransient((objects) => objects.map((candidate) => candidate.id === object.id ? { ...candidate, [endpoint]: reference } as SceneObject : candidate))
      store.endTransient('Connect line')
      useUi.getState().toast(`Connected to ${snap.port.label}`, 'success')
    } else {
      store.endTransient(isHose && endpoint ? 'Move line end' : 'Reshape line')
    }
    snapRef.current = null
    setSnap(null)
    setActive(null)
  }

  function removeVertex(index: number) {
    if (count <= 2 || index === 0 || index === count - 1) return
    useBoard.getState().commit((objects) => objects.map((candidate) => {
      if (candidate.id !== object.id) return candidate
      const points = [...(candidate as PathObject).points]
      points.splice(index * 2, 2)
      return { ...candidate, points } as SceneObject
    }), 'Remove bend')
  }

  const handles = []
  for (let index = 0; index < count; index += 1) {
    const key = `v-${index}`
    if (active && active.key !== key) continue
    const point = pointAt(object.points, active?.key === key ? active.index : index)
    const endpoint = isHose ? (index === 0 ? 'from' : index === count - 1 ? 'to' : undefined) : undefined
    const isEnd = index === 0 || index === count - 1
    const connected = isHose && endpoint ? Boolean((object as HoseObject)[endpoint]) : false
    handles.push(
      <Circle
        key={key}
        x={point.x}
        y={point.y}
        radius={(isEnd ? 9 : 7) * inv}
        fill={connected ? ink.ok : isEnd ? '#f3f1ea' : ink.select}
        stroke={ink.outline}
        strokeWidth={2}
        strokeScaleEnabled={false}
        hitStrokeWidth={18}
        draggable
        name="edit-handle"
        onDragStart={() => { useBoard.getState().beginTransient(); setActive({ key, index, endpoint }) }}
        onDragMove={(event) => vertexDragMove(index, endpoint, event)}
        onDragEnd={() => vertexDragEnd(endpoint)}
        onDblClick={() => removeVertex(index)}
        onDblTap={() => removeVertex(index)}
      />,
    )
  }
  for (let segment = 0; segment < count - 1; segment += 1) {
    const key = `m-${segment}`
    if (active && active.key !== key) continue
    const a = pointAt(object.points, segment)
    const b = pointAt(object.points, segment + 1)
    if (!active && distance(a, b) / inv < 34) continue
    const position = active?.key === key ? pointAt(object.points, active.index) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    handles.push(
      <Group
        key={key}
        x={position.x}
        y={position.y}
        draggable
        name="edit-handle"
        onDragStart={(event) => {
          const store = useBoard.getState()
          store.beginTransient()
          const { x, y } = event.target.position()
          update((target) => {
            const points = [...target.points]
            points.splice((segment + 1) * 2, 0, x, y)
            return { ...target, points } as PathObject
          })
          setActive({ key, index: segment + 1 })
        }}
        onDragMove={(event) => {
          const { x, y } = event.target.position()
          update((target) => ({ ...target, points: replacePoint(target.points, segment + 1, x, y) }) as PathObject)
        }}
        onDragEnd={() => { useBoard.getState().endTransient('Add bend'); setActive(null) }}
      >
        <Circle radius={6 * inv} fill="rgba(11,16,19,0.75)" stroke={ink.select} strokeWidth={1.5} strokeScaleEnabled={false} hitStrokeWidth={16} />
        <Text x={-5 * inv} y={-6 * inv} width={10 * inv} align="center" text="+" fontSize={12 * inv} fontStyle="bold" fill={ink.select} listening={false} />
      </Group>,
    )
  }
  return (
    <Group>
      {handles}
      {snap && <Circle x={snap.x} y={snap.y} radius={16 * inv} stroke={ink.ok} strokeWidth={3} strokeScaleEnabled={false} fill="rgba(76,195,138,0.25)" listening={false} />}
    </Group>
  )
}

/** Drag handle on the edge of a zone marker to set its radius. */
export function RadiusHandle({ object, inv }: { object: MarkerObject; inv: number }) {
  if (!object.radius || object.locked) return null
  return (
    <Circle
      x={object.x + object.radius}
      y={object.y}
      radius={8 * inv}
      fill="#f3f1ea"
      stroke={ink.outline}
      strokeWidth={2}
      strokeScaleEnabled={false}
      draggable
      name="edit-handle"
      onDragStart={() => useBoard.getState().beginTransient()}
      onDragMove={(event) => {
        const { x, y } = event.target.position()
        const radius = Math.min(5000, Math.max(10, distance({ x, y }, object)))
        event.target.position({ x: object.x + radius, y: object.y })
        useBoard.getState().setTransient((objects) => objects.map((candidate) => candidate.id === object.id ? { ...candidate, radius } as SceneObject : candidate))
      }}
      onDragEnd={() => useBoard.getState().endTransient('Resize zone')}
    />
  )
}
