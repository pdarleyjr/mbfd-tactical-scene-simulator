import { create } from 'zustand'
import { applyScenePatch, type Board, type Scenario, type ScenePatch, type SceneObject, type Snapshot, type TimelineEntry, type TimerState, type Training } from '@mbfd/domain'
import { applyDiff, diffObjects, isEmptyDiff, reconcileHoses, type SceneContext, type SceneDiff } from '@mbfd/fire-model'
import { boardFromTemplate } from '../templates'

const HISTORY_LIMIT = 200

export function sceneContext(scenario: Scenario): SceneContext {
  return { calibration: scenario.calibration, apparatusLengthFt: scenario.apparatusLengthFt }
}

/** Server clock minus this device's clock, so a shared timer reads the same everywhere. */
let clockOffsetMs = 0

export function setClockOffset(offset: number) {
  clockOffsetMs = Number.isFinite(offset) ? offset : 0
}

export function sharedNow(): number {
  return Date.now() + clockOffsetMs
}

export function elapsedMs(timer: TimerState, now = sharedNow()): number {
  return timer.accumulatedMs + (timer.running && timer.startedAt !== null ? Math.max(0, now - timer.startedAt) : 0)
}

type ObjectsUpdate = SceneObject[] | ((objects: SceneObject[]) => SceneObject[])

export interface BoardStore {
  board: Board
  /** True once the saved board has been read from storage. */
  hydrated: boolean
  /** Your own changes, as reversible diffs, so undo never touches other people's work. */
  past: HistoryStep[]
  future: HistoryStep[]
  /** Objects as they were when a drag or other continuous edit began. */
  transientBase: SceneObject[] | null
  setBoard(board: Board, options?: { hydrated?: boolean; live?: boolean }): void
  /** Applies a change made by someone else in a shared scene. */
  applyRemote(patch: ScenePatch): void
  /** Someone replaced the whole shared scene (reset, import, restore). */
  replaceRemote(board: Board, options?: { keepHistory?: boolean }): void
  commit(update: ObjectsUpdate, label: string): void
  beginTransient(): void
  setTransient(update: ObjectsUpdate): void
  endTransient(label: string): void
  cancelTransient(): void
  undo(): void
  redo(): void
  renameBoard(name: string): void
  updateScenario(update: (scenario: Scenario) => Scenario): void
  updateTraining(update: (training: Training) => Training): void
  startTimer(): void
  pauseTimer(): void
  resetRun(): void
  toggleBenchmark(id: string): void
  revealInject(id: string): void
  concealInject(id: string): void
  addSnapshot(name: string): Snapshot
  deleteSnapshot(id: string): void
  restoreSnapshot(id: string): void
}

/**
 * A board saved with the clock running is reopened paused at the time of its
 * last save, so a scenario left overnight does not show 14 hours elapsed or
 * reveal every timed inject at once.
 */
export function pauseStaleClock(board: Board): Board {
  const timer = board.training.timer
  if (!timer.running || timer.startedAt === null) return board
  const savedAt = Date.parse(board.updatedAt)
  const ran = Number.isFinite(savedAt) ? Math.max(0, savedAt - timer.startedAt) : 0
  return { ...board, training: { ...board.training, timer: { running: false, startedAt: null, accumulatedMs: timer.accumulatedMs + ran } } }
}

export interface HistoryStep {
  undo: SceneDiff
  redo: SceneDiff
  /** Every object the change touched, as it was before and after (absent = did not exist). */
  touched: string[]
  before: SceneObject[]
  after: SceneObject[]
}

/** The change from before to after, plus its exact inverse. */
function historyStep(before: readonly SceneObject[], after: readonly SceneObject[]): HistoryStep {
  const redo = diffObjects(before, after)
  const previous = new Map(before.map((object) => [object.id, object]))
  const next = new Map(after.map((object) => [object.id, object]))
  const touched = [...redo.upserts.map((object) => object.id), ...redo.removes]
  const undo: SceneDiff = {
    upserts: touched.flatMap((id) => { const object = previous.get(id); return object ? [object] : [] }),
    removes: redo.upserts.filter((object) => !previous.has(object.id)).map((object) => object.id),
    ...(redo.order ? { order: before.map((object) => object.id) } : {}),
  }
  const pick = (from: Map<string, SceneObject>) => touched.flatMap((id) => { const object = from.get(id); return object ? [object] : [] })
  return { undo, redo, touched, before: pick(previous), after: pick(next) }
}

function sameObject(a: SceneObject | undefined, b: SceneObject | undefined) {
  return a === b || (a !== undefined && b !== undefined && JSON.stringify(a) === JSON.stringify(b))
}

/**
 * Keeps only the parts of an undo or redo whose objects are still exactly as
 * this change left them, so it never overwrites or brings back an object
 * someone else has since changed or deleted.
 */
function untouchedSince(diff: SceneDiff, expected: readonly SceneObject[], touched: readonly string[], objects: readonly SceneObject[]): SceneDiff {
  const current = new Map(objects.map((object) => [object.id, object]))
  const wanted = new Map(expected.map((object) => [object.id, object]))
  const ours = new Set(touched.filter((id) => sameObject(current.get(id), wanted.get(id))))
  return {
    upserts: diff.upserts.filter((object) => ours.has(object.id)),
    removes: diff.removes.filter((id) => ours.has(id)),
    ...(diff.order ? { order: diff.order } : {}),
  }
}

function resolve(update: ObjectsUpdate, objects: SceneObject[]): SceneObject[] {
  return typeof update === 'function' ? update(objects) : update
}

function timelineEntry(board: Board, kind: TimelineEntry['kind'], label: string, extra: Partial<TimelineEntry> = {}): TimelineEntry {
  return { id: crypto.randomUUID(), at: elapsedMs(board.training.timer), kind, label, ...extra }
}

/** Appends to the review timeline when a run is being recorded. */
function record(board: Board, kind: TimelineEntry['kind'], label: string, extra: Partial<TimelineEntry> = {}): Board['run'] {
  if (!board.run) return board.run
  return { ...board.run, entries: [...board.run.entries, timelineEntry(board, kind, label, extra)] }
}

function withObjects(board: Board, before: SceneObject[], objects: SceneObject[], label: string): Board {
  const next = { ...board, objects, updatedAt: new Date().toISOString() }
  const diff = diffObjects(before, objects)
  if (isEmptyDiff(diff)) return next
  return { ...next, run: record(board, 'change', label, diff) }
}

export const useBoard = create<BoardStore>()((set, get) => ({
  board: boardFromTemplate(),
  hydrated: false,
  past: [],
  future: [],
  transientBase: null,

  setBoard(board, options = {}) {
    const objects = reconcileHoses(board.objects, sceneContext(board.scenario))
    const reconciled = objects === board.objects ? board : { ...board, objects }
    // A shared scene's clock keeps running for everyone; only local boards pause on reopen.
    set({ board: options.live ? reconciled : pauseStaleClock(reconciled), past: [], future: [], transientBase: null, hydrated: options.hydrated ?? true })
  },

  applyRemote(patch) {
    const { board, transientBase } = get()
    let next = applyScenePatch(board, patch)
    const objects = reconcileHoses(next.objects, sceneContext(next.scenario))
    if (objects !== next.objects) next = { ...next, objects }
    // Keep a drag in progress consistent with everyone else's edits.
    const base = transientBase && (patch.upserts || patch.removes || patch.order) ? applyScenePatch({ ...board, objects: transientBase }, { upserts: patch.upserts, removes: patch.removes, order: patch.order }).objects : transientBase
    set({ board: next, transientBase: base })
  },

  replaceRemote(board, options = {}) {
    if (!options.keepHistory) { get().setBoard(board, { live: true }); return }
    const objects = reconcileHoses(board.objects, sceneContext(board.scenario))
    set({ board: objects === board.objects ? board : { ...board, objects }, transientBase: null, hydrated: true })
  },

  commit(update, label) {
    const { board, transientBase, past } = get()
    const before = transientBase ?? board.objects
    const next = reconcileHoses(resolve(update, board.objects), sceneContext(board.scenario))
    if (next === before) {
      // Back to where the gesture started: show it, with nothing new to undo.
      set({ board: next === board.objects ? board : { ...board, objects: next }, transientBase: null })
      return
    }
    set({ board: withObjects(board, before, next, label), past: [...past, historyStep(before, next)].slice(-HISTORY_LIMIT), future: [], transientBase: null })
  },

  beginTransient() {
    if (get().transientBase) return
    set({ transientBase: get().board.objects })
  },

  setTransient(update) {
    const { board } = get()
    if (!get().transientBase) set({ transientBase: board.objects })
    const objects = reconcileHoses(resolve(update, board.objects), sceneContext(board.scenario))
    set({ board: { ...board, objects } })
  },

  endTransient(label) {
    const { board, transientBase, past } = get()
    if (!transientBase) return
    if (board.objects === transientBase) { set({ transientBase: null }); return }
    set({ board: withObjects(board, transientBase, board.objects, label), past: [...past, historyStep(transientBase, board.objects)].slice(-HISTORY_LIMIT), future: [], transientBase: null })
  },

  cancelTransient() {
    const { board, transientBase } = get()
    if (!transientBase) return
    set({ board: { ...board, objects: transientBase }, transientBase: null })
  },

  undo() {
    const { board, past, future } = get()
    const step = past.at(-1)
    if (!step) return
    const objects = reconcileHoses(applyDiff(board.objects, untouchedSince(step.undo, step.after, step.touched, board.objects)), sceneContext(board.scenario))
    set({ board: withObjects(board, board.objects, objects, 'Undo'), past: past.slice(0, -1), future: [...future, step].slice(-HISTORY_LIMIT), transientBase: null })
  },

  redo() {
    const { board, past, future } = get()
    const step = future.at(-1)
    if (!step) return
    const objects = reconcileHoses(applyDiff(board.objects, untouchedSince(step.redo, step.before, step.touched, board.objects)), sceneContext(board.scenario))
    set({ board: withObjects(board, board.objects, objects, 'Redo'), past: [...past, step].slice(-HISTORY_LIMIT), future: future.slice(0, -1), transientBase: null })
  },

  renameBoard(name) {
    const trimmed = name.trim().slice(0, 120)
    if (!trimmed) return
    set({ board: { ...get().board, name: trimmed, updatedAt: new Date().toISOString() } })
  },

  updateScenario(update) {
    const { board } = get()
    const scenario = update(board.scenario)
    if (scenario === board.scenario) return
    // Calibration and vehicle lengths move connection points; keep hoses attached.
    const objects = reconcileHoses(board.objects, sceneContext(scenario))
    set({ board: { ...board, scenario, objects, updatedAt: new Date().toISOString() } })
  },

  updateTraining(update) {
    const { board } = get()
    set({ board: { ...board, training: update(board.training), updatedAt: new Date().toISOString() } })
  },

  startTimer() {
    const { board } = get()
    if (board.training.timer.running) return
    const run = board.run ?? { startedAt: new Date().toISOString(), base: board.objects, entries: [] }
    set({ board: { ...board, run, training: { ...board.training, timer: { ...board.training.timer, running: true, startedAt: sharedNow() } }, updatedAt: new Date().toISOString() } })
  },

  pauseTimer() {
    const { board } = get()
    const timer = board.training.timer
    if (!timer.running) return
    set({ board: { ...board, training: { ...board.training, timer: { running: false, startedAt: null, accumulatedMs: elapsedMs(timer) } }, updatedAt: new Date().toISOString() } })
  },

  resetRun() {
    const { board } = get()
    set({ board: { ...board, run: null, training: { ...board.training, timer: { running: false, startedAt: null, accumulatedMs: 0 }, revealed: {}, completed: {} }, updatedAt: new Date().toISOString() } })
  },

  toggleBenchmark(id) {
    const { board } = get()
    const benchmark = board.scenario.benchmarks.find((item) => item.id === id)
    if (!benchmark) return
    const completed = { ...board.training.completed }
    const done = id in completed
    if (done) delete completed[id]
    else completed[id] = elapsedMs(board.training.timer)
    set({ board: { ...board, training: { ...board.training, completed }, run: record(board, 'benchmark', `${done ? 'Reopened' : 'Completed'}: ${benchmark.label}`), updatedAt: new Date().toISOString() } })
  },

  revealInject(id) {
    const { board } = get()
    const inject = board.scenario.injects.find((item) => item.id === id)
    if (!inject || id in board.training.revealed) return
    set({ board: { ...board, training: { ...board.training, revealed: { ...board.training.revealed, [id]: elapsedMs(board.training.timer) } }, run: record(board, 'inject', `Inject: ${inject.title}`), updatedAt: new Date().toISOString() } })
  },

  concealInject(id) {
    const { board } = get()
    if (!(id in board.training.revealed)) return
    const revealed = { ...board.training.revealed }
    delete revealed[id]
    set({ board: { ...board, training: { ...board.training, revealed }, updatedAt: new Date().toISOString() } })
  },

  addSnapshot(name) {
    const { board } = get()
    const snapshot: Snapshot = { id: crypto.randomUUID(), name: name.trim().slice(0, 120) || 'Snapshot', createdAt: new Date().toISOString(), elapsedMs: board.run ? elapsedMs(board.training.timer) : null, objects: board.objects }
    set({ board: { ...board, snapshots: [...board.snapshots, snapshot].slice(-100), run: record(board, 'snapshot', `Snapshot: ${snapshot.name}`), updatedAt: new Date().toISOString() } })
    return snapshot
  },

  deleteSnapshot(id) {
    const { board } = get()
    set({ board: { ...board, snapshots: board.snapshots.filter((snapshot) => snapshot.id !== id), updatedAt: new Date().toISOString() } })
  },

  restoreSnapshot(id) {
    const snapshot = get().board.snapshots.find((item) => item.id === id)
    if (snapshot) get().commit(snapshot.objects, `Restored snapshot “${snapshot.name}”`)
  },
}))

export function useObjects() {
  return useBoard((state) => state.board.objects)
}
