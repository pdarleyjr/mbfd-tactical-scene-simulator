import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Circle, Layer, Stage } from 'react-konva'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, RotateCw, Undo2, X } from 'lucide-react'
import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { ConnectionPoint, FiregroundObject } from '@mbfd/domain'
import { canConnect } from '@mbfd/fire-model'
import { createApparatus, createHydrant, moveObject, type SceneActor } from './actions'
import { fitWorldToViewport, screenToWorld, zoomAroundPoint, type ViewportTransform } from '../canvas/viewport'
import { BackgroundLayer } from './layers/BackgroundLayer'
import { HoseDraftLayer, HoseLayer } from './layers/HoseLayer'
import { hoseStyles } from './layers/hoseStyles'
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
  feetPerWorldUnit?: number | undefined
  objects: FiregroundObject[]
  staticObjects?: FiregroundObject[] | undefined
  comparisonObjects?: FiregroundObject[] | undefined
  actor: SceneActor
  mode: CanvasMode
  placementTemplateId?: string | undefined
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
  const [hose3Purpose, setHose3Purpose] = useState<'attack' | 'supply'>('supply')
  const allObjects = useMemo(() => [...(props.staticObjects ?? []), ...props.objects], [props.objects, props.staticObjects])
  const worldWidth = props.world.width
  const worldHeight = props.world.height
  const selectedApparatus = useMemo(() => allObjects.find((object): object is Extract<FiregroundObject, { type: 'apparatus' }> => object.id === props.selectedObjectId && object.type === 'apparatus'), [allObjects, props.selectedObjectId])
  const draftLengthWorld = draft.reduce((total, _value, index) => index >= 2 && index % 2 === 0 ? total + Math.hypot(draft[index]! - draft[index - 2]!, draft[index + 1]! - draft[index - 1]!) : total, 0)
  const draftLengthFeet = draftLengthWorld * (props.feetPerWorldUnit ?? 1)

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

  useEffect(() => { setDraft([]); setDraftFrom(undefined); setDraftTo(undefined); setSnap(undefined) }, [props.mode])

  function worldPointFromClient(point: { x: number; y: number }) {
    const bounds = hostRef.current?.getBoundingClientRect()
    if (!bounds || point.x < bounds.left || point.x > bounds.right || point.y < bounds.top || point.y > bounds.bottom) return undefined
    return screenToWorld({ x: point.x - bounds.left, y: point.y - bounds.top }, view)
  }

  function placeTemplate(templateId: string, point: { x: number; y: number }) {
    if (props.readOnly) return
    const apparatus = createApparatus(templateId, point, props.actor)
    props.onUpsert(apparatus)
    props.onSelect(apparatus.id)
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

  function finishHose(points: number[]) {
    if (points.length < 4 || props.readOnly) return
    const type = hoseTypeFromMode(props.mode)
    const now = new Date().toISOString()
    const lengthWorld = points.reduce((total, _value, index) => index >= 2 && index % 2 === 0 ? total + Math.hypot(points[index]! - points[index - 2]!, points[index + 1]! - points[index - 1]!) : total, 0)
    const length = lengthWorld * (props.feetPerWorldUnit ?? 1)
    const id = crypto.randomUUID()
    props.onUpsert({
      id, type: 'hoseSegment', hoseType: type,
      coupling: endpointCoupling(true), startCoupling: endpointCoupling(true), endCoupling: endpointCoupling(false),
      points, nominalLengthFt: Math.max(25, Math.round(length)), sectionCount: Math.max(1, Math.ceil(length / 100)),
      layDirection: type === 'supply5' ? 'hydrant-to-apparatus' : type === 'hose3' ? (hose3Purpose === 'supply' ? 'feeder' : 'attack') : 'attack',
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

  function undoHosePoint() {
    setDraft((points) => {
      const next = points.slice(0, -2)
      if (!next.length) setDraftFrom(undefined)
      setDraftTo(undefined)
      return next
    })
    setSnap(undefined)
  }

  function cancelHose() {
    setDraft([])
    setDraftFrom(undefined)
    setDraftTo(undefined)
    setSnap(undefined)
  }

  function transformApparatus(object: Extract<FiregroundObject, { type: 'apparatus' }>, update: { x?: number; y?: number; rotation?: number }) {
    if (!canMove(object)) return
    props.onUpsert({ ...object, ...update, rotation: ((update.rotation ?? object.rotation) % 360 + 360) % 360, updatedByClientId: props.actor.clientId, updatedAt: new Date().toISOString() })
  }

  return <div ref={hostRef} className="canvas-host" tabIndex={0} aria-label="Interactive tactical scene map" onKeyDown={(event) => { if (event.key === 'Enter' && props.placementTemplateId) placeTemplate(props.placementTemplateId, screenToWorld({ x: size.width / 2, y: size.height / 2 }, view)); if (event.key === 'Escape') setDraft([]); if (selectedApparatus && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); const amount = event.shiftKey ? 10 : 2; transformApparatus(selectedApparatus, { x: selectedApparatus.x + (event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0), y: selectedApparatus.y + (event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0) }) } }}>
    <Stage ref={stageRef} width={size.width} height={size.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}
      draggable={props.mode === 'pan'} onPointerDown={handleStagePointer} onPointerMove={handleStagePointer}
      onDragEnd={(event) => { if (event.target === stageRef.current) setView((current) => ({ ...current, x: event.target.x(), y: event.target.y() })) }}
      onWheel={(event) => { event.evt.preventDefault(); const stage = event.target.getStage(); const pointer = stage?.getPointerPosition(); if (!pointer) return; setView((current) => zoomAroundPoint(current, pointer, current.scale * (event.evt.deltaY > 0 ? .9 : 1.1), { min: .05, max: 8 })) }}>
      <BackgroundLayer source={props.backgroundUrl} width={props.world.width} height={props.world.height}/>
      <HoseLayer objects={allObjects} selectedId={props.selectedObjectId} onSelect={(object) => props.onSelect(object.id)}/>
      <ApparatusLayer objects={allObjects} selectedId={props.selectedObjectId} canMove={canMove} onSelect={(object) => props.onSelect(object.id)} onTransform={(object,x,y,rotation) => transformApparatus(object,{x,y,rotation})}/>
      <SymbolLayer objects={allObjects} selectedId={props.selectedObjectId} canMove={canMove} onSelect={(object) => props.onSelect(object.id)} onMove={(object,x,y) => props.onUpsert(moveObject(object,{x,y},props.actor.clientId))}/>
      {props.comparisonObjects?.length ? <ComparisonLayer objects={props.comparisonObjects}/> : null}
      <PresenceLayer presence={props.presence ?? []}/>
      <HoseDraftLayer points={draft} hoseType={hoseTypeFromMode(props.mode)}/>
      {snap && <Layer listening={false}><Circle x={snap.x} y={snap.y} radius={15 / view.scale} stroke="#45a179" strokeWidth={4 / view.scale} fill="rgba(69,161,121,.28)"/></Layer>}
    </Stage>
    {selectedApparatus && canMove(selectedApparatus) && props.mode === 'select' && <section className="absolute bottom-3 left-3 z-20 max-w-[calc(100%-1.5rem)] border border-[#57a8df] bg-[#111a1f]/95 p-3 shadow-2xl" aria-label="Selected apparatus positioning controls"><div className="mb-2 flex items-center justify-between gap-4"><span><strong className="display block">{selectedApparatus.apparatusTemplateId} positioning</strong><small className="muted">Drag to move · blue handle rotates · arrows nudge 2 units</small></span><output className="display min-w-14 text-right">{Math.round(selectedApparatus.rotation)}°</output></div><div className="flex flex-wrap gap-2"><div className="grid grid-cols-3 gap-1"><span/><button className="btn btn-secondary !h-12 !w-12 !p-0" aria-label="Nudge apparatus up" onClick={() => transformApparatus(selectedApparatus,{y:selectedApparatus.y-2})}><ArrowUp/></button><span/><button className="btn btn-secondary !h-12 !w-12 !p-0" aria-label="Nudge apparatus left" onClick={() => transformApparatus(selectedApparatus,{x:selectedApparatus.x-2})}><ArrowLeft/></button><button className="btn btn-secondary !h-12 !w-12 !p-0" aria-label="Nudge apparatus down" onClick={() => transformApparatus(selectedApparatus,{y:selectedApparatus.y+2})}><ArrowDown/></button><button className="btn btn-secondary !h-12 !w-12 !p-0" aria-label="Nudge apparatus right" onClick={() => transformApparatus(selectedApparatus,{x:selectedApparatus.x+2})}><ArrowRight/></button></div><div className="flex flex-wrap content-start gap-1"><button className="btn btn-secondary !h-12 !px-3" onClick={() => transformApparatus(selectedApparatus,{rotation:selectedApparatus.rotation-15})}><RotateCcw size={18}/>15°</button><button className="btn btn-secondary !h-12 !px-3" onClick={() => transformApparatus(selectedApparatus,{rotation:selectedApparatus.rotation-1})}>−1°</button><button className="btn btn-secondary !h-12 !px-3" onClick={() => transformApparatus(selectedApparatus,{rotation:selectedApparatus.rotation+1})}>+1°</button><button className="btn btn-secondary !h-12 !px-3" onClick={() => transformApparatus(selectedApparatus,{rotation:selectedApparatus.rotation+15})}><RotateCw size={18}/>15°</button></div></div></section>}
    {props.mode.startsWith('hose-') && <section className="absolute bottom-3 right-3 z-20 w-[min(94%,460px)] border border-[#53646e] bg-[#111a1f]/95 p-3 shadow-2xl"><div className="flex items-start gap-3"><span className="mt-1 h-5 w-5 shrink-0 rounded-full border-2 border-black" style={{background:hoseStyles[hoseTypeFromMode(props.mode)].color}}/><div className="min-w-0 flex-1"><strong className="display block">Draw {hoseStyles[hoseTypeFromMode(props.mode)].label}</strong><small className="muted block">Click or tap the map once for the start. Keep clicking each point you want the hose to follow, then select Finish line.</small></div><output className="display whitespace-nowrap">{Math.round(draftLengthFeet)} ft{props.feetPerWorldUnit ? '' : '*'}</output></div><p className="mt-2 border-l-4 border-[#57a8df] bg-[#1d2a32] p-2 text-sm" role="status" data-testid="hose-point-count">{draft.length === 0 ? 'Place the first point on the map.' : draft.length === 2 ? 'Start placed. Click the next point.' : `${draft.length / 2} points connected. Keep clicking or finish the line.`}</p>{props.mode === 'hose-hose3' && <fieldset className="mt-3"><legend className="sr-only">3-inch hose purpose</legend><div className="grid grid-cols-2 gap-2"><button className={`btn ${hose3Purpose === 'attack' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setHose3Purpose('attack')}>Attack line</button><button className={`btn ${hose3Purpose === 'supply' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setHose3Purpose('supply')}>Supply / feeder</button></div></fieldset>}<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><button className="btn btn-secondary" disabled={!draft.length} onClick={undoHosePoint}><Undo2 size={18}/>Undo point</button><button className="btn btn-secondary" disabled={!draft.length} onClick={cancelHose}><X size={18}/>Cancel line</button><button className="btn btn-primary col-span-2 sm:col-span-1" disabled={draft.length < 4} onClick={() => finishHose(draft)}>Finish line</button></div>{!props.feetPerWorldUnit && <small className="muted mt-2 block">*Length uses map units until an instructor enters the scenario’s feet-per-unit calibration.</small>}</section>}
  </div>
})
