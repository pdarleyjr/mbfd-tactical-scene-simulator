import { findApparatusTemplate, hoseCatalog, type EvolutionId, type HoseObject, type HosePurpose, type HoseType, type PortRef, type SceneObject } from '@mbfd/domain'
import {
  createApparatus,
  createHydrant,
  createMarker,
  createNote,
  createNozzle,
  createWye,
  distance,
  evolutionSteps,
  apparatusModelFor,
  findPort,
  findSnapTarget,
  hitsObject,
  headingDegrees,
  newId,
  pointAt,
  pointCount,
  polylineLength,
  portWorldPosition,
  readLength,
  rotateVector,
  simplifyPath,
  startRuleAccepts,
  type EvolutionStep,
  type SnapTarget,
  type Vec,
} from '@mbfd/fire-model'
import { sceneContext, useBoard } from '../store/board'
import { downwindDegrees } from './effects'
import { useUi, type Draft } from '../store/ui'

/** Snap distance in screen pixels; generous for fingers. */
const SNAP_PX = 30
/** Extra margin around a truck or hydrant body that still counts as a tap on it. */
const BODY_PX = 10
/** Tapping within this distance of the last point finishes the line. */
const FINISH_PX = 14

function scale() {
  return useUi.getState().view.scale
}

export interface HoseSpec {
  hoseType: HoseType
  purpose: HosePurpose
  step?: EvolutionStep | undefined
  evolutionId?: EvolutionId | undefined
}

export function currentHoseSpec(draft: Draft | null = useUi.getState().draft): HoseSpec {
  const { hoseChoice } = useUi.getState()
  if (draft?.continueHoseId) {
    const hose = useBoard.getState().board.objects.find((object) => object.id === draft.continueHoseId)
    if (hose?.type === 'hose') return { hoseType: hose.hoseType, purpose: hose.purpose }
  }
  if (draft?.steps) {
    const step = draft.steps[draft.stepIndex ?? 0]!
    return { hoseType: step.hoseType, purpose: step.purpose, step, evolutionId: draft.evolutionId }
  }
  if (hoseChoice.kind === 'free') return { hoseType: hoseChoice.hoseType, purpose: hoseChoice.purpose }
  const steps = evolutionSteps(hoseChoice.evolutionId, useBoard.getState().board.scenario.hoseLoads)
  return { hoseType: steps[0]!.hoseType, purpose: steps[0]!.purpose, step: steps[0], evolutionId: hoseChoice.evolutionId }
}

function portDirection(reference: PortRef | undefined) {
  if (!reference) return undefined
  const { board } = useBoard.getState()
  const object = board.objects.find((candidate) => candidate.id === reference.objectId)
  return object ? findPort(object, reference.portId, sceneContext(board.scenario))?.direction : undefined
}

export function hoseSnapAt(point: Vec, draft: Draft | null = useUi.getState().draft): SnapTarget | undefined {
  const { board } = useBoard.getState()
  const spec = currentHoseSpec(draft)
  const starting = !draft || draft.points.length === 0
  const step = spec.step
  return findSnapTarget(board.objects, {
    hoseType: spec.hoseType,
    point,
    radius: SNAP_PX / scale(),
    context: sceneContext(board.scenario),
    otherEndDirection: starting ? undefined : portDirection(draft?.from),
    excludeHoseId: draft?.continueHoseId,
    // Tapping a truck or hydrant anywhere on its body counts as tapping its fitting port.
    bodyMargin: BODY_PX / scale(),
    ...(starting && step ? { accept: (object: SceneObject, port) => startRuleAccepts(step.start, object, port) } : {}),
  })
}

/** The truck or hydrant under a point, used to explain why a lay could not start there. */
function objectUnder(point: Vec): SceneObject | undefined {
  const { board } = useBoard.getState()
  const context = sceneContext(board.scenario)
  return [...board.objects].reverse().find((object) => hitsObject(object, point, context, BODY_PX / scale()))
}

function startHoseDraft(point: Vec): Draft | undefined {
  const ui = useUi.getState()
  const snap = hoseSnapAt(point, null)
  const spec = currentHoseSpec(null)
  if (!snap) {
    const under = objectUnder(point)
    if (under?.type === 'apparatus') {
      const model = apparatusModelFor(under.templateId, under.modelId)
      ui.toast(model.pump ? `No free connection on ${under.label} for this line.` : `${under.label} has no pump. Pull lines from an engine or ladder.`, 'warning')
      return undefined
    }
    if (spec.step && spec.step.start !== 'any') {
      ui.toast(spec.step.prompt.start, 'info')
      return undefined
    }
  }
  const loads = useBoard.getState().board.scenario.hoseLoads
  let evolutionId = ui.hoseChoice.kind === 'evolution' ? ui.hoseChoice.evolutionId : undefined
  // A supply line started at an engine is a reverse lay; at a hydrant, a forward lay.
  if (evolutionId === 'forward-lay' && snap?.object.type === 'apparatus') evolutionId = 'reverse-lay'
  const steps = evolutionId ? evolutionSteps(evolutionId, loads) : undefined
  return {
    kind: 'hose',
    points: snap ? [snap.x, snap.y] : [point.x, point.y],
    from: snap ? { objectId: snap.objectId, portId: snap.portId } : undefined,
    steps,
    stepIndex: steps ? 0 : undefined,
    evolutionId,
  }
}

function nearLastPoint(draft: Draft, point: Vec): boolean {
  if (draft.points.length < 2) return false
  const last = pointAt(draft.points, pointCount(draft.points) - 1)
  return distance(last, point) * scale() <= FINISH_PX
}

/** A single tap or click while a drawing tool is active. */
export function draftTap(point: Vec) {
  const ui = useUi.getState()
  const tool = ui.tool
  const draft = ui.draft
  if (tool === 'hose') {
    if (!draft) {
      const started = startHoseDraft(point)
      if (started) ui.setDraft(started)
      return
    }
    if (draft.points.length >= 4 && nearLastPoint(draft, point)) { finishDraft(); return }
    const snap = hoseSnapAt(point, draft)
    if (snap) {
      ui.setDraft({ ...draft, points: [...draft.points, snap.x, snap.y] })
      finishDraft({ objectId: snap.objectId, portId: snap.portId })
      return
    }
    ui.setDraft({ ...draft, points: [...draft.points, point.x, point.y] })
    return
  }
  if (tool === 'arrow' || tool === 'measure') {
    if (draft && draft.points.length >= 4 && nearLastPoint(draft, point) && tool === 'arrow') { finishDraft(); return }
    ui.setDraft({ kind: tool, points: [...(draft?.points ?? []), point.x, point.y] })
    return
  }
  if (tool === 'calibrate') {
    const points = [...(draft?.points ?? []), point.x, point.y]
    if (points.length >= 4) {
      ui.setDraft(null)
      ui.setPendingCalibration({ a: pointAt(points, 0), b: pointAt(points, 1) })
      ui.openDialog('calibrate')
    } else {
      ui.setDraft({ kind: 'calibrate', points })
    }
  }
}

/** A freehand stroke drawn with a finger or mouse drag, in world units. */
export function draftStroke(raw: number[]) {
  const ui = useUi.getState()
  if (raw.length < 4 || (ui.tool !== 'hose' && ui.tool !== 'arrow')) return
  const simplified = simplifyPath(raw, 3 / scale())
  let draft = ui.draft
  if (!draft) {
    const start = pointAt(simplified, 0)
    draft = ui.tool === 'hose' ? startHoseDraft(start) ?? null : { kind: 'arrow', points: [start.x, start.y] }
    if (!draft) return
  }
  const appended = [...draft.points, ...simplified.slice(2)]
  const end = pointAt(simplified, pointCount(simplified) - 1)
  if (ui.tool === 'hose') {
    const snap = hoseSnapAt(end, draft)
    if (snap) {
      appended.splice(appended.length - 2, 2, snap.x, snap.y)
      ui.setDraft({ ...draft, points: appended })
      finishDraft({ objectId: snap.objectId, portId: snap.portId })
      return
    }
  }
  ui.setDraft({ ...draft, points: appended })
}

export function undoDraftPoint() {
  const ui = useUi.getState()
  const draft = ui.draft
  if (!draft) return
  if (draft.basePointCount !== undefined && draft.points.length <= draft.basePointCount) { ui.setDraft(null); return }
  const points = draft.points.slice(0, -2)
  if (!points.length) { ui.setDraft(null); return }
  ui.setDraft({ ...draft, points })
}

export function cancelDraft() {
  useUi.getState().setDraft(null)
}

function placeTerminal(end: Vec, previous: Vec, kind: 'nozzle' | 'wye', nozzleType: 'fog' | 'smooth-bore') {
  const heading = headingDegrees(previous, end)
  const inletLocal = kind === 'nozzle' ? { x: 0, y: 6 } : { x: 0, y: 10 }
  const offset = rotateVector(inletLocal, heading)
  const at = { x: end.x - offset.x, y: end.y - offset.y }
  return kind === 'nozzle' ? createNozzle(at, heading, nozzleType) : createWye(at, heading)
}

export function finishDraft(to?: PortRef) {
  const ui = useUi.getState()
  const board = useBoard.getState()
  const draft = ui.draft
  if (!draft) return
  if (draft.kind === 'arrow') {
    if (draft.points.length >= 4) board.commit((objects) => [...objects, { id: newId(), type: 'arrow', points: draft.points, color: ui.arrowColor, label: '', locked: false }], 'Draw arrow')
    ui.setDraft(null)
    return
  }
  if (draft.kind === 'measure') { pinMeasurement(); return }
  if (draft.kind !== 'hose' || draft.points.length < 4) return

  const spec = currentHoseSpec(draft)
  const step = spec.step
  const added: SceneObject[] = []
  let terminalTo = to
  const end = pointAt(draft.points, pointCount(draft.points) - 1)
  const previous = pointAt(draft.points, pointCount(draft.points) - 2)
  let nextDraft: Draft | null = null
  if (!terminalTo && step && step.finish !== 'none' && distance(previous, end) > 0) {
    const nozzleType = ui.hoseChoice.kind === 'evolution' ? ui.hoseChoice.nozzle : 'fog'
    const terminal = placeTerminal(end, previous, step.finish === 'nozzle' ? 'nozzle' : 'wye', nozzleType)
    added.push(terminal)
    terminalTo = { objectId: terminal.id, portId: 'inlet' }
    const following = draft.steps?.[(draft.stepIndex ?? 0) + 1]
    if (following && terminal.type === 'appliance') {
      const outlet = findPort(terminal, 'outlet-a')!
      const start = portWorldPosition(terminal, outlet)
      nextDraft = { ...draft, points: [start.x, start.y], from: { objectId: terminal.id, portId: 'outlet-a' }, stepIndex: (draft.stepIndex ?? 0) + 1, continueHoseId: undefined }
    }
  }

  const label = draft.evolutionId ? `Lay ${draft.evolutionId.replace('-', ' ')}` : `Lay ${hoseCatalog[spec.hoseType].label}`
  if (draft.continueHoseId) {
    board.commit((objects) => [...objects.map((object) => object.id === draft.continueHoseId && object.type === 'hose' ? { ...object, points: draft.points, ...(terminalTo ? { to: terminalTo } : {}) } : object), ...added], 'Extend line')
  } else {
    const hose: HoseObject = {
      id: newId(),
      type: 'hose',
      hoseType: spec.hoseType,
      purpose: spec.purpose,
      points: draft.points,
      ...(draft.from ? { from: draft.from } : {}),
      ...(terminalTo ? { to: terminalTo } : {}),
      ...(draft.evolutionId ? { evolution: draft.evolutionId } : {}),
      ...(step?.layDirection ? { layDirection: step.layDirection } : {}),
      ...(step ? { loadFt: step.loadFt } : {}),
      label: '',
      locked: false,
    }
    board.commit((objects) => [...objects, hose, ...added], label)
  }
  const length = readLength(polylineLength(draft.points), useBoard.getState().board.scenario.calibration)
  ui.setDraft(nextDraft)
  if (nextDraft) ui.toast(`Feeder laid · ${length.text}. ${nextDraft.steps![nextDraft.stepIndex!]!.prompt.route}`, 'success')
  else ui.toast(`${hoseCatalog[spec.hoseType].label} laid · ${length.text}`, 'success')
}

export function pinMeasurement() {
  const ui = useUi.getState()
  const draft = ui.draft
  if (draft?.kind === 'measure' && draft.points.length >= 4) {
    useBoard.getState().commit((objects) => [...objects, { id: newId(), type: 'measurement', points: draft.points, locked: false }], 'Pin measurement')
  }
  ui.setDraft(null)
}

/** Starts extending an existing hose from its open far end. */
export function extendHose(hose: HoseObject) {
  if (hose.to) return
  const ui = useUi.getState()
  ui.setTool('hose')
  ui.setDraft({ kind: 'hose', points: hose.points, from: hose.from, continueHoseId: hose.id, basePointCount: hose.points.length })
}

/** Placement tools: one tap drops one object and the tool stays armed. */
export function placeAt(point: Vec) {
  const ui = useUi.getState()
  const board = useBoard.getState()
  const objects = board.board.objects
  if (ui.tool === 'apparatus' && ui.apparatusTemplate) return placeApparatusAt(ui.apparatusTemplate, point)
  if (ui.tool === 'hydrant') {
    const hydrant = createHydrant(point, objects)
    board.commit([...objects, hydrant], `Place hydrant ${hydrant.label}`)
    return hydrant
  }
  if (ui.tool === 'marker') {
    const created = createMarker(ui.markerType, point, board.board.scenario.calibration?.feetPerWorldUnit)
    // Smoke starts out drifting downwind; it can then be rotated freely like flames.
    const marker = created.markerType === 'smoke' ? { ...created, rotation: downwindDegrees(board.board.scenario.conditions) } : created
    board.commit([...objects, marker], 'Place marker')
    return marker
  }
  if (ui.tool === 'note') {
    const note = createNote(point, 'New note')
    board.commit([...objects, note], 'Add note')
    ui.setTool('select')
    ui.select([note.id])
    return note
  }
  return undefined
}

/** Drops a vehicle dragged out of the tray at a world point. */
export function placeApparatusAt(templateId: string, point: Vec) {
  const ui = useUi.getState()
  const board = useBoard.getState()
  const template = findApparatusTemplate(templateId)
  if (!template) return undefined
  const existing = board.board.objects.find((object) => object.type === 'apparatus' && object.templateId === template.id)
  ui.setTool('select')
  if (existing) {
    // Each unit is on the scene once: tapping it again selects the one already there.
    ui.select([existing.id])
    ui.toast(`${template.designation} is already on the scene. It is selected so you can move it.`, 'info')
    return existing
  }
  const apparatus = createApparatus(template.id, point, ui.lastRotation[template.id] ?? 0, board.board.objects)
  board.commit([...board.board.objects, apparatus], `Place ${apparatus.label}`)
  ui.select([apparatus.id])
  ui.toast(`${apparatus.label} placed. Drag it to move, use the round handle to rotate.`, 'success')
  return apparatus
}