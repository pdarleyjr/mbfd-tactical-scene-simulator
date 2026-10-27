import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Group, Image, Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import Konva from 'konva'
import { apparatusCatalog, findMarker, isPathObject, type HoseObject, type MarkerObject, type MeasurementObject, type SceneObject } from '@mbfd/domain'
import {
  apparatusSize,
  boundsOfPoints,
  normalizeDegrees,
  polylineLength,
  readHose,
  readLength,
  sceneAt,
  translateObject,
  type ApparatusSize,
  type HoseReading,
  type LengthReading,
  type Vec,
} from '@mbfd/fire-model'
import { waterSupplyFor } from '../store/selectors'
import { sceneContext, useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { useMediaUrl } from '../lib/session'
import { canvasApi } from './api'
import { draftStroke, draftTap, placeApparatusAt, placeAt } from './drafting'
import { preloadImage, useHtmlImage } from './images'
import { FlowContext, InteractionContext, ink, type NodeInteraction } from './interaction'
import { fitWorldToViewport, pinchViewport, preserveCenterOnResize, screenToWorld, zoomAroundPoint, type ViewportTransform } from './viewport'
import { ApparatusNode } from './nodes/ApparatusNode'
import { ApparatusLabel } from './nodes/ApparatusLabel'
import { HoseNode } from './nodes/HoseNode'
import { ArrowNode, HydrantNode, MarkerNode, MeasurementNode, NoteNode, NozzleNode, WyeNode } from './nodes/SymbolNodes'
import { PathHandles, RadiusHandle } from './overlays/EditHandles'
import { DraftOverlay } from './overlays/DraftOverlay'
import { EffectsLayer } from './nodes/EffectsLayer'
import { downwindDegrees } from './effects'

Konva.dragDistance = 5
Konva.hitOnDragEnabled = false

for (const template of apparatusCatalog) preloadImage(template.assetPath)

type Gesture =
  | { kind: 'pan'; start: Vec; view: ViewportTransform; moved: boolean; world: Vec; tap: 'deselect' | 'place' | 'draft' | 'none'; locked?: boolean }
  | { kind: 'stroke'; start: Vec; world: Vec; points: number[]; moved: boolean; last: Vec }
  | { kind: 'marquee'; start: Vec; current: Vec; local: Vec; moved: boolean }
  | { kind: 'pinch'; last: { distance: number; center: Vec } }
  | { kind: 'idle' }

const ROTATABLE = new Set(['apparatus', 'appliance', 'nozzle'])
const rotationSnaps = Array.from({ length: 24 }, (_value, index) => index * 15)

function chromePadding(width: number) {
  if (width < 760) return { top: 70, right: 12, bottom: 104, left: 12 }
  const k = width >= 2600 ? 1.6 : 1
  return { top: 76 * k, right: 28 * k, bottom: 28 * k, left: 104 * k }
}

function objectCenter(object: SceneObject): Vec {
  if (isPathObject(object)) {
    const bounds = boundsOfPoints(object.points)
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 }
  }
  return { x: object.x, y: object.y }
}

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function SceneStage() {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<Konva.Stage>(null)
  const hoseLayerRef = useRef<Konva.Layer>(null)
  const overlayRef = useRef<Konva.Layer>(null)
  const transformerRef = useRef<Konva.Transformer>(null)
  const sizeRef = useRef<{ width: number; height: number } | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const pointers = useRef(new Map<number, Vec>())
  const gesture = useRef<Gesture>({ kind: 'idle' })
  const drag = useRef<{ id: string; start: Vec; originals: Map<string, SceneObject>; path: boolean } | null>(null)
  const [marquee, setMarquee] = useState<{ a: Vec; b: Vec } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)
  const [shiftDown, setShiftDown] = useState(false)
  const strokePreview = useRef<number[] | null>(null)
  const [, setStrokeVersion] = useState(0)

  const board = useBoard((state) => state.board)
  const view = useUi((state) => state.view)
  const setView = useUi((state) => state.setView)
  const tool = useUi((state) => state.tool)
  const selection = useUi((state) => state.selection)
  const layers = useUi((state) => state.layers)
  const presenting = useUi((state) => state.presenting)
  const reviewing = useUi((state) => state.reviewing)
  const display = useUi((state) => state.display)
  const reviewAtMs = useUi((state) => state.reviewAtMs)
  const compareSnapshotId = useUi((state) => state.compareSnapshotId)
  const backgroundUrl = useMediaUrl(board.scenario.background)
  const { image: background, failed: backgroundFailed } = useHtmlImage(backgroundUrl)

  const scenario = board.scenario
  const world = scenario.world
  const objects = useMemo(() => reviewing && board.run ? sceneAt(board.run.base, board.run.entries, reviewAtMs) : board.objects, [reviewing, board.run, board.objects, reviewAtMs])
  const context = useMemo(() => sceneContext(scenario), [scenario])
  const supply = waterSupplyFor(objects, scenario.hoseLoads, scenario.calibration)
  // Per-object readings cached by identity so memoized nodes skip unchanged objects.
  const sizeFor = useMemo(() => {
    const cache = new Map<string, ApparatusSize>()
    return (templateId: string, modelId?: string) => {
      const key = `${templateId}:${modelId ?? ''}`
      return cache.get(key) ?? cache.set(key, apparatusSize(templateId, context, modelId)).get(key)!
    }
  }, [context])
  const hoseReading = useMemo(() => {
    const cache = new WeakMap<SceneObject, HoseReading>()
    return (hose: HoseObject) => cache.get(hose) ?? cache.set(hose, readHose(hose, scenario.hoseLoads, scenario.calibration)).get(hose)!
  }, [scenario.hoseLoads, scenario.calibration])
  const lengthReading = useMemo(() => {
    const cache = new WeakMap<SceneObject, LengthReading>()
    return (object: MeasurementObject) => cache.get(object) ?? cache.set(object, readLength(polylineLength(object.points), scenario.calibration)).get(object)!
  }, [scenario.calibration])
  const interactive = tool === 'select' && !reviewing && !display && !spaceDown
  const inv = 1 / view.scale
  const roundedInv = Math.round(inv * 1000) / 1000
  // Matches the CSS chrome zoom on very large displays running at 100% scaling.
  const labelScale = (presenting ? 1.35 : 1) * (size.width >= 2600 ? 1.6 : 1)
  const selected = useMemo(() => new Set(selection), [selection])
  const compareObjects = useMemo(() => compareSnapshotId ? board.snapshots.find((snapshot) => snapshot.id === compareSnapshotId)?.objects : undefined, [compareSnapshotId, board.snapshots])

  const fit = useCallback(() => {
    const current = sizeRef.current
    if (!current) return
    setView(fitWorldToViewport(world, current, chromePadding(current.width)))
  }, [setView, world])

  // Size tracking: fit once, then keep the operator's view through resizes.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const next = { width: Math.max(1, Math.round(entry.contentRect.width)), height: Math.max(1, Math.round(entry.contentRect.height)) }
      const previous = sizeRef.current
      sizeRef.current = next
      setSize(next)
      if (!previous) useUi.getState().setView(fitWorldToViewport(world, next, chromePadding(next.width)))
      else useUi.getState().setView((current) => preserveCenterOnResize(current, previous, next))
    })
    observer.observe(host)
    return () => observer.disconnect()
  }, [world])

  // Refit when a different board or map is opened.
  const boardKey = `${board.id}:${world.width}x${world.height}`
  const lastBoardKey = useRef(boardKey)
  useEffect(() => {
    if (lastBoardKey.current === boardKey) return
    lastBoardKey.current = boardKey
    fit()
  }, [boardKey, fit])

  const clientToLocal = useCallback((clientX: number, clientY: number) => {
    const bounds = hostRef.current?.getBoundingClientRect()
    return bounds ? { x: clientX - bounds.left, y: clientY - bounds.top } : undefined
  }, [])

  // Imperative API for the chrome.
  useEffect(() => {
    canvasApi.current = {
      clientToWorld(clientX, clientY) {
        const bounds = hostRef.current?.getBoundingClientRect()
        if (!bounds || clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return undefined
        return screenToWorld({ x: clientX - bounds.left, y: clientY - bounds.top }, useUi.getState().view)
      },
      viewCenter() {
        const current = sizeRef.current ?? { width: 800, height: 600 }
        return screenToWorld({ x: current.width / 2, y: current.height / 2 }, useUi.getState().view)
      },
      fit,
      zoomBy(factor) {
        const current = sizeRef.current ?? { width: 800, height: 600 }
        useUi.getState().setView((value) => zoomAroundPoint(value, { x: current.width / 2, y: current.height / 2 }, value.scale * factor))
      },
      centerOn(point) {
        const current = sizeRef.current ?? { width: 800, height: 600 }
        useUi.getState().setView((value) => ({ ...value, x: current.width / 2 - point.x * value.scale, y: current.height / 2 - point.y * value.scale }))
      },
      async exportPng() {
        const stage = stageRef.current
        if (!stage) return undefined
        const current = useUi.getState().view
        overlayRef.current?.hide()
        try {
          const pixelRatio = Math.min(2.5, Math.max(0.5, Math.min(3200, world.width * 1.6) / (world.width * current.scale)))
          const canvas = stage.toCanvas({ x: current.x, y: current.y, width: world.width * current.scale, height: world.height * current.scale, pixelRatio })
          return await new Promise<Blob | undefined>((resolve) => canvas.toBlob((blob) => resolve(blob ?? undefined), 'image/png'))
        } finally {
          overlayRef.current?.show()
        }
      },
      thumbnail() {
        const stage = stageRef.current
        if (!stage || !background) return undefined
        const current = useUi.getState().view
        overlayRef.current?.hide()
        try {
          return stage.toDataURL({ x: current.x, y: current.y, width: world.width * current.scale, height: world.height * current.scale, pixelRatio: 360 / (world.width * current.scale), mimeType: 'image/jpeg', quality: 0.72 })
        } catch {
          return undefined
        } finally {
          overlayRef.current?.show()
        }
      },
    }
    return () => { canvasApi.current = null }
  }, [background, fit, world])

  // Wheel zoom around the pointer (also handles trackpad pinch).
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const local = clientToLocal(event.clientX, event.clientY)
      if (!local) return
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
      useUi.getState().setView((current) => zoomAroundPoint(current, local, current.scale * Math.exp(-delta * (event.ctrlKey ? 0.006 : 0.0011))))
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    return () => host.removeEventListener('wheel', onWheel)
  }, [clientToLocal])

  // Space-to-pan and shift for marquee / free rotation.
  useEffect(() => {
    // Space pans only when focus is on the page or the map, never a control or dialog.
    const isMapFocus = (target: EventTarget | null) => target === document.body || target === hostRef.current || (target instanceof Node && Boolean(hostRef.current?.contains(target)))
    const down = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftDown(true)
      if (event.code === 'Space' && isMapFocus(event.target) && !document.querySelector('dialog[open]')) { setSpaceDown(true); event.preventDefault() }
    }
    const up = (event: KeyboardEvent) => {
      if (event.key === 'Shift') setShiftDown(false)
      if (event.code === 'Space') setSpaceDown(false)
    }
    const blur = () => { setShiftDown(false); setSpaceDown(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [])

  // Water-flow animation: one loop for every charged line.
  const flowNodes = useRef(new Set<Konva.Line>())
  const flowRegistry = useMemo(() => ({
    register(node: Konva.Line) {
      flowNodes.current.add(node)
      return () => { flowNodes.current.delete(node) }
    },
  }), [])
  useEffect(() => {
    const layer = hoseLayerRef.current
    if (!layer || prefersReducedMotion()) return
    let last = 0
    const animation = new Konva.Animation((frame) => {
      if (!frame || !flowNodes.current.size) return false
      if (frame.time - last < 33) return false
      last = frame.time
      const offset = -(frame.time / 1000) * 22
      flowNodes.current.forEach((node) => node.dashOffset(offset))
      return true
    }, layer)
    animation.start()
    return () => { animation.stop() }
  }, [])

  // Konva only rebuilds hit regions on draw; refresh them when objects become
  // clickable again (e.g. switching back to Select) so the first tap lands.
  useLayoutEffect(() => {
    stageRef.current?.getLayers().forEach((layer) => layer.draw())
  }, [interactive])

  // Keep the rotate handle attached to the selected vehicles and appliances.
  const rotatableIds = useMemo(() => objects.filter((object) => selected.has(object.id) && ROTATABLE.has(object.type) && !object.locked).map((object) => object.id), [objects, selected])
  useEffect(() => {
    const transformer = transformerRef.current
    const stage = stageRef.current
    if (!transformer || !stage) return
    const nodes = interactive ? rotatableIds.map((id) => stage.findOne(`#${id}`)).filter((node): node is Konva.Node => Boolean(node)) : []
    transformer.nodes(nodes)
    transformer.getLayer()?.batchDraw()
  }, [rotatableIds, interactive, objects])

  function syncTransform() {
    const transformer = transformerRef.current
    if (!transformer) return
    const updates = new Map(transformer.nodes().map((node) => [node.id(), { x: node.x(), y: node.y(), rotation: normalizeDegrees(node.rotation()) }]))
    useBoard.getState().setTransient((current) => current.map((object) => {
      const update = updates.get(object.id)
      return update && 'rotation' in object ? { ...object, ...update } as SceneObject : object
    }))
  }

  const interaction = useMemo<NodeInteraction>(() => ({
    interactive,
    pick(id, event) {
      if (!interactive) return
      event.cancelBubble = true
      const ui = useUi.getState()
      if (event.evt.shiftKey) ui.toggleSelected(id)
      else if (!ui.selection.includes(id)) ui.select([id])
    },
    dragStart(id, event) {
      const ui = useUi.getState()
      if (!ui.selection.includes(id)) ui.select([id])
      const ids = new Set(useUi.getState().selection)
      const current = useBoard.getState().board.objects
      const originals = new Map(current.filter((object) => ids.has(object.id) && !object.locked).map((object) => [object.id, object]))
      const dragged = current.find((object) => object.id === id)
      drag.current = { id, start: event.target.position(), originals, path: Boolean(dragged && isPathObject(dragged)) }
      useBoard.getState().beginTransient()
    },
    dragMove(_id, event) {
      const active = drag.current
      if (!active) return
      const position = event.target.position()
      const dx = position.x - active.start.x
      const dy = position.y - active.start.y
      useBoard.getState().setTransient((current) => current.map((object) => {
        const original = active.originals.get(object.id)
        if (!original || (active.path && object.id === active.id)) return object
        return translateObject(original, dx, dy)
      }))
    },
    dragEnd(_id, event) {
      const active = drag.current
      if (!active) return
      const position = event.target.position()
      const dx = position.x - active.start.x
      const dy = position.y - active.start.y
      if (active.path) event.target.position({ x: 0, y: 0 })
      useBoard.getState().setTransient((current) => current.map((object) => {
        const original = active.originals.get(object.id)
        return original ? translateObject(original, dx, dy) : object
      }))
      useBoard.getState().endTransient(active.originals.size > 1 ? `Move ${active.originals.size} objects` : 'Move')
      drag.current = null
    },
  }), [interactive])

  function cancelNodeDrags() {
    // Clear the drag first: stopDrag() fires dragend, which must not commit.
    const wasDragging = Boolean(drag.current)
    drag.current = null
    stageRef.current?.find('.scene-object').forEach((node) => { if (node.isDragging()) node.stopDrag() })
    if (wasDragging) useBoard.getState().cancelTransient()
  }

  function pinchGeometry(): { distance: number; center: Vec } | undefined {
    const [first, second] = [...pointers.current.values()]
    if (!first || !second) return undefined
    const a = clientToLocal(first.x, first.y)
    const b = clientToLocal(second.x, second.y)
    if (!a || !b) return undefined
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const host = hostRef.current
    if (pointers.current.size >= 2) {
      cancelNodeDrags()
      // Re-anchor on every added finger so a third touch cannot make the view jump.
      const geometry = pinchGeometry()
      gesture.current = geometry ? { kind: 'pinch', last: geometry } : { kind: 'idle' }
      strokePreview.current = null
      setStrokeVersion((value) => value + 1)
      setMarquee(null)
      return
    }
    const local = clientToLocal(event.clientX, event.clientY)
    const stage = stageRef.current
    if (!local || !stage) return
    const currentView = useUi.getState().view
    const worldPoint = screenToWorld(local, currentView)
    // The map only moves when asked to: right or middle drag, Space + drag, or two fingers.
    const panRequested = spaceDown || event.button === 1 || event.button === 2
    if (!panRequested && interactive) {
      const hit = stage.getIntersection(local)
      if (hit) { gesture.current = { kind: 'idle' }; return }
    }
    try { host?.setPointerCapture(event.pointerId) } catch { /* synthetic or already-released pointer */ }
    if (panRequested) gesture.current = { kind: 'pan', start: local, view: currentView, moved: false, world: worldPoint, tap: 'none' }
    else if (reviewing || display) gesture.current = { kind: 'pan', start: local, view: currentView, moved: false, world: worldPoint, tap: 'none' }
    else if (tool === 'select') gesture.current = { kind: 'marquee', start: worldPoint, current: worldPoint, local, moved: false }
    else if (tool === 'hose' || tool === 'arrow') gesture.current = { kind: 'stroke', start: local, world: worldPoint, points: [worldPoint.x, worldPoint.y], moved: false, last: local }
    else if (tool === 'measure' || tool === 'calibrate') gesture.current = { kind: 'pan', start: local, view: currentView, moved: false, world: worldPoint, tap: 'draft', locked: true }
    else gesture.current = { kind: 'pan', start: local, view: currentView, moved: false, world: worldPoint, tap: 'place', locked: true }
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const local = clientToLocal(event.clientX, event.clientY)
    if (!local) return
    const currentView = useUi.getState().view
    const worldPoint = screenToWorld(local, currentView)
    if (tool !== 'select' && !reviewing) useUi.getState().setCursor(worldPoint)
    const active = gesture.current
    if (active.kind === 'pinch') {
      const next = pinchGeometry()
      if (!next) return
      useUi.getState().setView((value) => pinchViewport(value, active.last, next))
      gesture.current = { kind: 'pinch', last: next }
    } else if (active.kind === 'pan') {
      const dx = local.x - active.start.x
      const dy = local.y - active.start.y
      if (!active.moved && Math.hypot(dx, dy) < 6) return
      active.moved = true
      if (active.locked) return
      useUi.getState().setView({ ...active.view, x: active.view.x + dx, y: active.view.y + dy })
    } else if (active.kind === 'stroke') {
      if (!active.moved && Math.hypot(local.x - active.start.x, local.y - active.start.y) < 7) return
      active.moved = true
      if (Math.hypot(local.x - active.last.x, local.y - active.last.y) < 3) return
      active.points.push(worldPoint.x, worldPoint.y)
      active.last = local
      setMarquee(null)
      strokePreview.current = [...active.points]
      setStrokeVersion((value) => value + 1)
    } else if (active.kind === 'marquee') {
      if (!active.moved && Math.hypot(local.x - active.local.x, local.y - active.local.y) < 6) return
      active.moved = true
      active.current = worldPoint
      setMarquee({ a: active.start, b: worldPoint })
    }
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    if (hostRef.current?.hasPointerCapture(event.pointerId)) hostRef.current.releasePointerCapture(event.pointerId)
    const active = gesture.current
    if (active.kind === 'pinch') {
      if (pointers.current.size < 2) gesture.current = { kind: 'idle' }
      return
    }
    gesture.current = { kind: 'idle' }
    if (active.kind === 'pan' && !active.moved) {
      if (active.tap === 'deselect') useUi.getState().select([])
      else if (active.tap === 'place') placeAt(active.world)
      else if (active.tap === 'draft') draftTap(active.world)
    } else if (active.kind === 'stroke') {
      strokePreview.current = null
      setStrokeVersion((value) => value + 1)
      if (active.moved) draftStroke(active.points)
      else draftTap(active.world)
    } else if (active.kind === 'marquee') {
      setMarquee(null)
      if (!active.moved) { if (!event.shiftKey) useUi.getState().select([]); return }
      const minX = Math.min(active.start.x, active.current.x)
      const maxX = Math.max(active.start.x, active.current.x)
      const minY = Math.min(active.start.y, active.current.y)
      const maxY = Math.max(active.start.y, active.current.y)
      const inside = useBoard.getState().board.objects.filter((object) => {
        const center = objectCenter(object)
        return center.x >= minX && center.x <= maxX && center.y >= minY && center.y <= maxY
      }).map((object) => object.id)
      const ui = useUi.getState()
      ui.select(event.shiftKey ? [...ui.selection, ...inside] : inside)
    }
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId)
    gesture.current = { kind: 'idle' }
    strokePreview.current = null
    setMarquee(null)
  }

  // Dropping a vehicle dragged from the tray.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const onDrop = (event: Event) => {
      const detail = (event as CustomEvent<{ templateId: string; clientX: number; clientY: number }>).detail
      const point = canvasApi.current?.clientToWorld(detail.clientX, detail.clientY)
      if (point) placeApparatusAt(detail.templateId, point)
    }
    const onDropCenter = (event: Event) => {
      const detail = (event as CustomEvent<{ templateId: string }>).detail
      const point = canvasApi.current?.viewCenter()
      if (point) placeApparatusAt(detail.templateId, point)
    }
    host.addEventListener('apparatus-drop', onDrop)
    host.addEventListener('apparatus-drop-center', onDropCenter)
    return () => { host.removeEventListener('apparatus-drop', onDrop); host.removeEventListener('apparatus-drop-center', onDropCenter) }
  }, [])

  const selectedSingle = selection.length === 1 ? objects.find((object) => object.id === selection[0]) : undefined
  const cursorStyle = spaceDown ? 'grab' : reviewing ? 'grab' : tool === 'select' ? 'default' : tool === 'apparatus' || tool === 'hydrant' || tool === 'marker' || tool === 'note' ? 'copy' : 'crosshair'
  const strokePoints = strokePreview.current

  const apparatus: SceneObject[] = []
  const hoses: SceneObject[] = []
  const symbols: SceneObject[] = []
  const effects: MarkerObject[] = []
  for (const object of objects) {
    if (object.type === 'apparatus') apparatus.push(object)
    else if (object.type === 'hose') hoses.push(object)
    else {
      symbols.push(object)
      if (object.type === 'marker' && findMarker(object.markerType)?.effect) effects.push(object)
    }
  }

  return (
    <div
      ref={hostRef}
      className="scene-host"
      data-testid="scene-canvas"
      data-tool={tool}
      style={{ cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => { if (tool !== 'select') useUi.getState().setCursor(null) }}
      onContextMenu={(event) => event.preventDefault()}
      role="application"
      aria-label={`Tactical map: ${scenario.title}`}
    >
      {size.width > 0 && (
        <Stage ref={stageRef} width={size.width} height={size.height} x={view.x} y={view.y} scaleX={view.scale} scaleY={view.scale}>
          <Layer listening={false}>
            <Rect x={-4 * inv} y={-4 * inv} width={world.width + 8 * inv} height={world.height + 8 * inv} fill="#05080a" />
            {background && <Image image={background} width={world.width} height={world.height} />}
            {!background && <Rect width={world.width} height={world.height} fill={backgroundFailed ? '#2a1a18' : '#1a242a'} />}
          </Layer>
          {layers.markers && effects.length > 0 && <EffectsLayer effects={effects} downwindDeg={downwindDegrees(scenario.conditions)} />}
          <InteractionContext.Provider value={interaction}>
            <Layer listening={interactive}>
              {apparatus.map((object) => object.type === 'apparatus' && (
                <ApparatusNode key={object.id} object={object} size={sizeFor(object.templateId, object.modelId)} selected={selected.has(object.id)} inv={roundedInv} />
              ))}
            </Layer>
            <FlowContext.Provider value={flowRegistry}>
              <Layer ref={hoseLayerRef} listening={interactive}>
                {hoses.map((object) => object.type === 'hose' && (
                  <HoseNode
                    key={object.id}
                    hose={object}
                    reading={hoseReading(object)}
                    state={supply.lines.get(object.id) ?? 'dry'}
                    selected={selected.has(object.id)}
                    inv={roundedInv}
                    showLength={layers.hoseLengths}
                    showFlow={layers.flow}
                  />
                ))}
              </Layer>
            </FlowContext.Provider>
            <Layer listening={interactive}>
              {symbols.map((object) => {
                const isSelected = selected.has(object.id)
                switch (object.type) {
                  case 'hydrant': return <HydrantNode key={object.id} object={object} selected={isSelected} inv={roundedInv} showLabel={layers.labels} />
                  case 'appliance': return <WyeNode key={object.id} object={object} selected={isSelected} />
                  case 'nozzle': return <NozzleNode key={object.id} object={object} selected={isSelected} />
                  case 'marker': return layers.markers ? <MarkerNode key={object.id} object={object} selected={isSelected} inv={roundedInv} feetPerUnit={scenario.calibration?.feetPerWorldUnit} /> : null
                  case 'note': return layers.markers ? <NoteNode key={object.id} object={object} selected={isSelected} inv={roundedInv} /> : null
                  case 'arrow': return layers.markers ? <ArrowNode key={object.id} object={object} selected={isSelected} inv={roundedInv} /> : null
                  case 'measurement': return <MeasurementNode key={object.id} object={object} selected={isSelected} inv={roundedInv} reading={lengthReading(object)} />
                  default: return null
                }
              })}
            </Layer>
          </InteractionContext.Provider>
          {layers.labels && (
            <Layer listening={false}>
              {apparatus.map((object) => {
                if (object.type !== 'apparatus') return null
                const unit = supply.apparatus.get(object.id)
                const state = unit?.supplied ? 'hydrant' : unit?.outputLineIds.length ? 'tank' : 'none'
                return <ApparatusLabel key={object.id} object={object} size={sizeFor(object.templateId, object.modelId)} inv={roundedInv} scale={labelScale} supply={state} />
              })}
            </Layer>
          )}
          <Layer ref={overlayRef}>
            {compareObjects && <CompareGhost objects={compareObjects} inv={roundedInv} context={context} />}
            {interactive && selectedSingle && isPathObject(selectedSingle) && <PathHandles object={selectedSingle} inv={roundedInv} />}
            {interactive && selectedSingle?.type === 'marker' && <RadiusHandle object={selectedSingle} inv={roundedInv} />}
            <Transformer
              ref={transformerRef}
              resizeEnabled={false}
              enabledAnchors={[]}
              rotateEnabled
              rotationSnaps={shiftDown ? [] : rotationSnaps}
              rotationSnapTolerance={6}
              rotateAnchorOffset={26}
              anchorSize={22}
              anchorCornerRadius={11}
              anchorFill="#f3f1ea"
              anchorStroke={ink.select}
              anchorStrokeWidth={2}
              borderStroke={ink.select}
              borderDash={[6, 4]}
              borderStrokeWidth={1.5}
              padding={5}
              flipEnabled={false}
              ignoreStroke
              onTransformStart={() => useBoard.getState().beginTransient()}
              onTransform={syncTransform}
              onTransformEnd={() => {
                syncTransform()
                useBoard.getState().endTransient('Rotate')
                const nodes = transformerRef.current?.nodes() ?? []
                for (const node of nodes) {
                  const object = useBoard.getState().board.objects.find((candidate) => candidate.id === node.id())
                  if (object?.type === 'apparatus') useUi.getState().rememberRotation(object.templateId, object.rotation)
                }
              }}
            />
            {!reviewing && <DraftOverlay inv={roundedInv} />}
            {strokePoints && strokePoints.length >= 4 && <Line points={strokePoints} stroke="#f3f1ea" strokeWidth={3} dash={[6, 5]} lineCap="round" lineJoin="round" strokeScaleEnabled={false} listening={false} />}
            {marquee && (
              <Rect
                x={Math.min(marquee.a.x, marquee.b.x)}
                y={Math.min(marquee.a.y, marquee.b.y)}
                width={Math.abs(marquee.b.x - marquee.a.x)}
                height={Math.abs(marquee.b.y - marquee.a.y)}
                stroke={ink.select}
                strokeWidth={1.5}
                dash={[6, 4]}
                strokeScaleEnabled={false}
                fill={ink.selectSoft}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      )}
    </div>
  )
}

function CompareGhost({ objects, inv, context }: { objects: SceneObject[]; inv: number; context: ReturnType<typeof sceneContext> }) {
  return (
    <Group listening={false} opacity={0.9}>
      {objects.map((object) => {
        if (object.type === 'hose') return <Line key={object.id} points={object.points} stroke="#69d3e7" strokeWidth={4} dash={[12, 7]} lineCap="round" lineJoin="round" strokeScaleEnabled={false} />
        if (object.type === 'apparatus') {
          const size = apparatusSize(object.templateId, context, object.modelId)
          return (
            <Group key={object.id} x={object.x} y={object.y} rotation={object.rotation}>
              <Rect x={-size.width / 2} y={-size.length / 2} width={size.width} height={size.length} stroke="#69d3e7" strokeWidth={2.5} dash={[8, 5]} strokeScaleEnabled={false} cornerRadius={3 * inv} />
            </Group>
          )
        }
        if ('x' in object) return <Rect key={object.id} x={object.x - 7 * inv} y={object.y - 7 * inv} width={14 * inv} height={14 * inv} stroke="#69d3e7" strokeWidth={2} strokeScaleEnabled={false} />
        return null
      })}
    </Group>
  )
}
