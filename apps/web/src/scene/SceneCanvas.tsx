import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Circle, Layer, Stage } from 'react-konva'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { ConnectionPoint, FiregroundObject } from '@mbfd/domain'
import { canConnect, createEvolutionObjects } from '@mbfd/fire-model'
import { createApparatus, createHydrant, moveObject, type SceneActor } from './actions'
import { fitWorldToViewport, screenToWorld, zoomAroundPoint, type ViewportTransform } from '../canvas/viewport'
import { BackgroundLayer } from './layers/BackgroundLayer'
import { HoseDraftLayer, HoseLayer } from './layers/HoseLayer'
import { ApparatusLayer } from './layers/ApparatusLayer'
import { SymbolLayer } from './layers/SymbolLayer'
import { PresenceLayer } from './layers/PresenceLayer'
import { ComparisonLayer } from './layers/ComparisonLayer'
import type { CanvasMode } from '../state/ui'

export interface SceneCanvasHandle {
  placeTemplateAtClientPoint: (templateId: string, point: { x: number; y: number }) => boolean
  placeAtCenter: (templateId: string) => void
  fit: () => void
}

interface Props {
  backgroundUrl: string
  world: { width: number; height: number }
  objects: FiregroundObject[]
  staticObjects?: FiregroundObject[] | undefined
  comparisonObjects?: FiregroundObject[] | undefined
  actor: SceneActor
  mode: CanvasMode
  placementTemplateId?: string | undefined
  selectedEvolutionId?: 'jumpline' | 'high-rise-pack' | 'skid-load' | 'forward-lay' | 'reverse-lay' | undefined
  selectedObjectId?: string | undefined
  readOnly?: boolean | undefined
  presence?: Array<Record<string, unknown>> | undefined
  onSelect: (id?: string | undefined) => void
  onUpsert: (object: FiregroundObject) => void
  onRemove: (object: FiregroundObject) => void
  onCursor?: ((point: { x: number; y: number }) => void) | undefined
  onPlacementComplete?: (() => void) | undefined
}

function hoseTypeFromMode(mode: CanvasMode) {
  if (mode === 'hose-attack175') return 'attack175' as const
  if (mode === 'hose-hose3') return 'hose3' as const
  return 'supply5' as const
}

export const SceneCanvas = forwardRef<SceneCanvasHandle, Props>(function SceneCanvas(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [view, setView] = useState<ViewportTransform>(() => fitWorldToViewport(props.world, size, 18))
  const [draft, setDraft] = useState<number[]>([])
  const [draftFrom, setDraftFrom] = useState<{ objectId: string; portId: string }>()
  const [draftTo, setDraftTo] = useState<{ objectId: string; portId: string }>()
  const [snap, setSnap] = useState<{ objectId: string; portId: string; x: number; y: number }>()
  const allObjects = useMemo(() => [...(props.staticObjects ?? []), ...props.objects], [props.objects, props.staticObjects])
  const worldWidth = props.world.width
  const worldHeight = props.world.height

  function fit() { setView(fitWorldToViewport(props.world, size, 18)) }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const next = { width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }
      setSize(next)
      setView(fitWorldToViewport({ width: worldWidth, height: worldHeight }, next, 18))
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [worldHeight, worldWidth])

  function worldPointFromClient(point: { x: number; y: number }) {
    const bounds = hostRef.current?.getBoundingClientRect()
    if (!bounds || point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return undefined
    return screenToWorld({ x: point.x - bounds.left, y: point.y - bounds.top }, view)
  }

  function placeTemplate(templateId: string, point: { x: number; y: number }) {
    if (props.readOnly) return
    props.onUpsert(createApparatus(templateId, point, props.actor))
    props.onPlacementComplete?.()
  }

  useImperativeHandle(ref, () => ({
    placeTemplateAtClientPoint(templateId, point) {
      const worldPoint = worldPointFromClient(point)
      if (!worldPoint) return false
      placeTemplate(templateId, worldPoint)
      return true
    },
    placeAtCenter(templateId) { placeTemplate(templateId, screenToWorld({ x: size.width / 2, y: size.height / 2 }, view)) },
    fit,
  }))

  function canMove(object: FiregroundObject) {
    return !props.readOnly && (object.createdByClientId === props.actor.clientId || object.createdByUnit === props.actor.unit || props.actor.unit === '300' || props.actor.unit === 'INSTRUCTOR')
  }

  function pointerWorld(stage: Konva.Stage) {
    const pointer = stage.getPointerPosition()
    return pointer ? screenToWorld(pointer, view) : undefined
  }

  function endpointCoupling(start: boolean): ConnectionPoint['coupling'] {
    const type = hoseTypeFromMode(props.mode)
    if (type === 'supply5') return 'storz-5'
    if (type === 'hose3') return start ? 'nh-2.5-female' : 'nh-2.5-male'
    return start ? 'nh-1.5-female' : 'nh-1.5-male'
  }

  function portPosition(object: FiregroundObject, port: ConnectionPoint) {
    const radians = object.rotation * Math.PI / 180
    return { x: object.x + port.x * Math.cos(radians) - port.y * Math.sin(radians), y: object.y + port.x * Math.sin(radians) + port.y * Math.cos(radians) }
  }

  function nearestPort(point: { x: number; y: number }, start: boolean) {
    const coupling = endpointCoupling(start)
    const occupied = new Set(props.objects.flatMap((object) => object.type === 'hoseSegment' ? [object.connectedFrom, object.connectedTo].filter(Boolean).map((reference) => `${reference!.objectId}:${reference!.portId}`) : []))
    let nearest: { objectId: string; portId: string; x: number; y: number; distance: number } | undefined
    for (const object of allObjects) {
      if (!('connectionPoints' in object)) continue
      for (const port of object.connectionPoints) {
        if (port.occupiedBy || occupied.has(`${object.id}:${port.id}`) || !canConnect({ coupling }, port)) continue
        const world = portPosition(object, port)
        const distance = Math.hypot(world.x - point.x, world.y - point.y)
        const threshold = 30 / view.scale
        if (distance <= threshold && (!nearest || distance < nearest.distance)) nearest = { objectId: object.id, portId: port.id, ...world, distance }
      }
    }
    return nearest
  }

  function addEvolution(at: { x: number; y: number }) {
    if (!props.selectedEvolutionId || props.readOnly) return
    const source = [...allObjects].reverse().find((item) => item.type === 'apparatus' || item.type === 'hydrant')
    if (!source) return
    createEvolutionObjects(props.selectedEvolutionId, props.actor, at, source.id).objects.forEach(props.onUpsert)
    props.onPlacementComplete?.()
  }

  function finishHose(points: number[]) {
    if (points.length < 4 || props.readOnly) return
    const type = hoseTypeFromMode(props.mode)
    const now = new Date().toISOString()
    const length = points.reduce((total, _value, index) => index >= 2 && index % 2 === 0 ? total + Math.hypot(points[index]! - points[index - 2]!, points[index + 1]! - points[index - 1]!) : total, 0)
    const id = crypto.randomUUID()
    props.onUpsert({
      id, type: 'hoseSegment', hoseType: type,
      coupling: endpointCoupling(true), startCoupling: endpointCoupling(true), endCoupling: endpointCoupling(false),
      points, nominalLengthFt: Math.max(25, Math.round(length)), sectionCount: Math.max(1, Math.ceil(length / 100)),
      layDirection: type === 'supply5' ? 'hydrant-to-apparatus' : type === 'hose3' ? 'feeder' : 'attack',
      ...(draftFrom ? { connectedFrom: draftFrom } : {}), ...(draftTo ? { connectedTo: draftTo } : {}),
      x: points[0]!, y: points[1]!, rotation: 0, locked: false,
      createdByClientId: props.actor.clientId, createdByName: props.actor.name, createdByUnit: props.actor.unit, createdAt: now, updatedAt: now,
    })
    setDraft([])
    setDraftFrom(undefined)
    setDraftTo(undefined)
    setSnap(undefined)
  }

  function handleStagePointer(event: KonvaEventObject<PointerEvent>) {
    const stage = event.target.getStage()
    if (!stage) return
    const point = pointerWorld(stage)
    if (!point) return
    props.onCursor?.(point)
    if (props.mode.startsWith('hose-')) setSnap(nearestPort(point, draft.length === 0))
    if (event.type !== 'pointerdown' || event.target !== stage) return
    if (props.placementTemplateId) return placeTemplate(props.placementTemplateId, point)
    if (props.selectedEvolutionId) return addEvolution(point)
    if (props.mode === 'hydrant' && !props.readOnly) { props.onUpsert(createHydrant(point, props.actor)); return }
    if (props.mode.startsWith('hose-')) {
      const target = nearestPort(point, draft.length === 0)
      const nextPoint = target ? { x: target.x, y: target.y } : point
      if (draft.length === 0) setDraftFrom(target ? { objectId: target.objectId, portId: target.portId } : undefined)
      else setDraftTo(target ? { objectId: target.objectId, portId: target.portId } : undefined)
      setDraft((current) => [...current, nextPoint.x, nextPoint.y])
    }
    else props.onSelect(undefined)
  }

  return <div ref={hostRef} className="canvas-host" tabIndex={0} aria-label="Interactive tactical scene map" onKeyDown={(event) => { if (event.key === 'Enter' && props.placementTemplateId) placeTemplate(props.placementTemplateId, screenToWorld({ x: size.width / 2, y: size.height / 2 }, view)); if (event.key === 'Escape') setDraft([]) }}>
    <Stage ref={stageRef} width={size.width} height={size.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}
      draggable={props.mode === 'pan'} onPointerDown={handleStagePointer} onPointerMove={handleStagePointer}
      onDragEnd={(event) => { if (event.target === stageRef.current) setView((current) => ({ ...current, x: event.target.x(), y: event.target.y() })) }}
      onWheel={(event) => { event.evt.preventDefault(); const stage = event.target.getStage(); const pointer = stage?.getPointerPosition(); if (!pointer) return; setView((current) => zoomAroundPoint(current, pointer, current.scale * (event.evt.deltaY > 0 ? .9 : 1.1), { min: .05, max: 8 })) }}>
      <BackgroundLayer source={props.backgroundUrl} width={props.world.width} height={props.world.height}/>
      <HoseLayer objects={allObjects} selectedId={props.selectedObjectId} onSelect={(object) => props.onSelect(object.id)}/>
      <ApparatusLayer objects={allObjects} selectedId={props.selectedObjectId} canMove={canMove} onSelect={(object) => props.onSelect(object.id)} onMove={(object,x,y) => props.onUpsert(moveObject(object,{x,y},props.actor.clientId))}/>
      <SymbolLayer objects={allObjects} selectedId={props.selectedObjectId} canMove={canMove} onSelect={(object) => props.onSelect(object.id)} onMove={(object,x,y) => props.onUpsert(moveObject(object,{x,y},props.actor.clientId))}/>
      {props.comparisonObjects?.length ? <ComparisonLayer objects={props.comparisonObjects}/> : null}
      <PresenceLayer presence={props.presence ?? []}/>
      <HoseDraftLayer points={draft}/>
      {snap && <Layer listening={false}><Circle x={snap.x} y={snap.y} radius={15 / view.scale} stroke="#45a179" strokeWidth={4 / view.scale} fill="rgba(69,161,121,.28)"/></Layer>}
    </Stage>
    {draft.length >= 4 && <button className="btn btn-primary absolute bottom-5 right-5 z-10" onClick={() => finishHose(draft)}>Finish hose</button>}
  </div>
})
