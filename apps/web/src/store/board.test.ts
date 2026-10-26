import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HoseObject, SceneObject } from '@mbfd/domain'
import { createApparatus, createNote, findPort, portWorldPosition, translateObject } from '@mbfd/fire-model'
import { boardFromTemplate } from '../templates'
import { elapsedMs, pauseStaleClock, sceneContext, useBoard } from './board'

const START = new Date('2026-10-25T12:00:00.000Z')

function store() {
  return useBoard.getState()
}

function objects() {
  return store().board.objects
}

function addNote(text = 'Note') {
  const note = createNote({ x: 100, y: 100 }, text)
  store().commit((current) => [...current, note], `Add ${text}`)
  return note
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  store().setBoard(boardFromTemplate())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('elapsedMs and sceneContext', () => {
  it('adds running time to the accumulated time', () => {
    expect(elapsedMs({ running: false, startedAt: null, accumulatedMs: 1500 })).toBe(1500)
    expect(elapsedMs({ running: true, startedAt: 1000, accumulatedMs: 500 }, 4000)).toBe(3500)
    expect(elapsedMs({ running: true, startedAt: 5000, accumulatedMs: 500 }, 4000)).toBe(500)
    expect(elapsedMs({ running: true, startedAt: null, accumulatedMs: 0 }, 4000)).toBe(0)
  })

  it('exposes calibration and vehicle lengths from the scenario', () => {
    const { scenario } = store().board
    expect(sceneContext({ ...scenario, apparatusLengthFt: { E1: 38 } })).toEqual({ calibration: scenario.calibration, apparatusLengthFt: { E1: 38 } })
    expect(scenario.calibration?.reference).toContain('Tennis court')
  })
})

describe('setBoard', () => {
  it('resets history and marks the store hydrated', () => {
    addNote()
    expect(store().past).toHaveLength(1)
    store().setBoard(boardFromTemplate(), { hydrated: false })
    expect(store().past).toEqual([])
    expect(store().future).toEqual([])
    expect(store().hydrated).toBe(false)
    store().setBoard(boardFromTemplate())
    expect(store().hydrated).toBe(true)
  })

  it('keeps the board instance when hoses need no repair', () => {
    const board = boardFromTemplate()
    store().setBoard(board)
    expect(store().board).toBe(board)
  })

  it('releases hose references to missing objects on load', () => {
    const board = boardFromTemplate()
    const dangling: HoseObject = { id: 'hose-1', type: 'hose', hoseType: 'supply5', purpose: 'supply', points: [0, 0, 50, 50], to: { objectId: 'missing', portId: 'intake' }, label: '', locked: false }
    store().setBoard({ ...board, objects: [...board.objects, dangling] })
    expect(objects().find((object) => object.id === 'hose-1')).not.toHaveProperty('to')
  })
})

describe('commit, undo, and redo', () => {
  it('records each commit and undoes and redoes it', () => {
    const initial = objects()
    const note = addNote()
    expect(objects()).toHaveLength(initial.length + 1)
    expect(store().past).toEqual([{ undo: { upserts: [], removes: [note.id] }, redo: { upserts: [note], removes: [] } }])

    store().undo()
    expect(objects()).toEqual(initial)
    expect(store().future).toHaveLength(1)

    store().redo()
    expect(objects().at(-1)).toEqual(note)
    expect(store().future).toEqual([])
  })

  it('accepts a replacement array as well as an updater', () => {
    const note = createNote({ x: 0, y: 0 })
    store().commit([note], 'Replace')
    expect(objects()).toEqual([note])
  })

  it('skips history when the update changes nothing', () => {
    store().commit((current) => current, 'Nothing')
    expect(store().past).toEqual([])
  })

  it('clears the redo stack on a new commit', () => {
    addNote('one')
    store().undo()
    addNote('two')
    expect(store().future).toEqual([])
    store().redo()
    expect(objects().at(-1)).toMatchObject({ text: 'two' })
  })

  it('ignores undo and redo with empty stacks', () => {
    const board = store().board
    store().undo()
    store().redo()
    expect(store().board).toBe(board)
  })

  it('caps history at 200 entries', () => {
    for (let index = 0; index < 205; index += 1) addNote(`n${index}`)
    expect(store().past).toHaveLength(200)
  })

  it('bumps updatedAt on commit', () => {
    vi.setSystemTime(new Date('2026-10-25T12:05:00.000Z'))
    addNote()
    expect(store().board.updatedAt).toBe('2026-10-25T12:05:00.000Z')
  })
})

describe('shared scenes', () => {
  it('undo reverts only this browser’s change, never someone else’s', () => {
    const mine = addNote('mine')
    const theirs = createNote({ x: 300, y: 300 }, 'theirs')
    store().applyRemote({ upserts: [theirs] })
    expect(store().past).toHaveLength(1)
    store().undo()
    expect(objects().some((object) => object.id === mine.id)).toBe(false)
    expect(objects().some((object) => object.id === theirs.id)).toBe(true)
    store().redo()
    expect(objects().some((object) => object.id === mine.id)).toBe(true)
  })

  it('undoing a move restores only the moved object, keeping a remote edit to another', () => {
    const a = addNote('a')
    const b = addNote('b')
    store().commit((current) => current.map((object) => object.id === a.id ? translateObject(object, 50, 0) : object), 'Move a')
    store().applyRemote({ upserts: [{ ...b, text: 'edited elsewhere' } as SceneObject] })
    store().undo()
    expect(objects().find((object) => object.id === a.id)).toMatchObject({ x: 100 })
    expect(objects().find((object) => object.id === b.id)).toMatchObject({ text: 'edited elsewhere' })
  })

  it('applies remote changes without recording history and keeps a drag base in step', () => {
    const note = addNote()
    store().beginTransient()
    const removed = createNote({ x: 1, y: 1 }, 'x')
    store().applyRemote({ upserts: [removed] })
    expect(store().transientBase?.some((object) => object.id === removed.id)).toBe(true)
    store().applyRemote({ removes: [note.id] })
    expect(store().transientBase?.some((object) => object.id === note.id)).toBe(false)
    expect(store().past).toHaveLength(1)
  })

  it('replaces the scene from the server, keeping history only when asked', () => {
    addNote()
    const fresh = boardFromTemplate()
    store().replaceRemote(fresh, { keepHistory: true })
    expect(store().past).toHaveLength(1)
    store().replaceRemote(fresh)
    expect(store().past).toEqual([])
    expect(store().board.id).toBe(fresh.id)
  })

  it('keeps a shared clock running when a live board loads', () => {
    const board = boardFromTemplate()
    const running = { ...board, training: { ...board.training, timer: { running: true, startedAt: START.getTime() - 60_000, accumulatedMs: 0 } } }
    store().setBoard(running, { live: true })
    expect(store().board.training.timer.running).toBe(true)
  })
})
describe('transient edits', () => {
  it('turns a drag into a single history entry', () => {
    const note = addNote()
    const beforeDrag = objects()
    const move = (dx: number) => store().setTransient((current) => current.map((object) => object.id === note.id ? translateObject(note, dx, 0) : object))

    store().beginTransient()
    move(10)
    move(20)
    move(30)
    expect(objects().find((object) => object.id === note.id)).toMatchObject({ x: 130 })
    expect(store().past).toHaveLength(1)

    store().endTransient('Move note')
    expect(store().past).toHaveLength(2)
    expect(store().transientBase).toBeNull()

    store().undo()
    expect(objects()).toEqual(beforeDrag)
  })

  it('keeps the first base when begun twice and auto-begins on setTransient', () => {
    const base = objects()
    store().setTransient((current) => [...current, createNote({ x: 0, y: 0 })])
    expect(store().transientBase).toBe(base)
    store().beginTransient()
    expect(store().transientBase).toBe(base)
  })

  it('restores the starting objects on cancel without touching history', () => {
    const base = objects()
    store().beginTransient()
    store().setTransient((current) => [...current, createNote({ x: 0, y: 0 })])
    store().cancelTransient()
    expect(objects()).toBe(base)
    expect(store().past).toEqual([])
    expect(store().transientBase).toBeNull()
  })

  it('does nothing when ending or cancelling without a transient edit', () => {
    const board = store().board
    store().endTransient('noop')
    store().cancelTransient()
    expect(store().board).toBe(board)
  })

  it('adds no history when a transient edit ends unchanged', () => {
    store().beginTransient()
    store().endTransient('noop')
    expect(store().past).toEqual([])
    expect(store().transientBase).toBeNull()
  })

  it('commits relative to the transient base during a drag', () => {
    const base = objects()
    store().beginTransient()
    store().setTransient((current) => [...current, createNote({ x: 0, y: 0 }, 'dragging')])
    store().commit((current) => [...current, createNote({ x: 5, y: 5 }, 'dropped')], 'Drop')
    expect(store().past).toHaveLength(1)
    expect(store().transientBase).toBeNull()
    store().undo()
    expect(objects()).toEqual(base)
  })

  it('clears the transient base when a commit inside a drag restores the start', () => {
    const base = objects()
    store().beginTransient()
    store().setTransient((current) => [...current, createNote({ x: 0, y: 0 })])
    store().commit(base, 'Back to start')
    expect(store().transientBase).toBeNull()
    expect(store().past).toEqual([])
  })

  // Known source bug (board.ts commit, `if (next === before)` branch): when a
  // commit during a transient edit resolves to the pre-drag array, only
  // transientBase is cleared; board.objects keeps the dragged state that the
  // commit asked to replace, and cancelTransient can no longer restore it.
  it('shows the committed objects when a commit inside a drag restores the start', () => {
    const base = objects()
    store().beginTransient()
    store().setTransient((current) => [...current, createNote({ x: 0, y: 0 })])
    store().commit(base, 'Back to start')
    expect(objects()).toBe(base)
  })
})

describe('board and scenario edits', () => {
  it('renames with trimming and ignores blank names', () => {
    store().renameBoard('  Night drill  ')
    expect(store().board.name).toBe('Night drill')
    store().renameBoard('   ')
    expect(store().board.name).toBe('Night drill')
  })

  it('updates the scenario and skips identical scenarios', () => {
    const board = store().board
    store().updateScenario((scenario) => scenario)
    expect(store().board).toBe(board)
    store().updateScenario((scenario) => ({ ...scenario, dispatch: 'Updated dispatch' }))
    expect(store().board.scenario.dispatch).toBe('Updated dispatch')
  })

  it('reattaches hose ends when vehicle scale changes', () => {
    const engine = createApparatus('E1', { x: 400, y: 400 }, 0, objects())
    const hydrant = objects()[0]!
    const supply: HoseObject = { id: 'supply', type: 'hose', hoseType: 'supply5', purpose: 'supply', points: [0, 0, 1, 1], from: { objectId: hydrant.id, portId: 'storz' }, to: { objectId: engine.id, portId: 'intake' }, label: '', locked: false }
    store().commit((current) => [...current, engine, supply], 'Lay supply')
    const intakeAt = () => { const board = store().board; const unit = board.objects.find((object) => object.id === engine.id)!; return portWorldPosition(unit, findPort(unit, 'intake', sceneContext(board.scenario))!) }
    const endBefore = (objects().find((object) => object.id === 'supply') as HoseObject).points.slice(-2)
    expect(endBefore[0]).toBeCloseTo(intakeAt().x, 6)
    expect(endBefore[1]).toBeCloseTo(intakeAt().y, 6)
    store().updateScenario((scenario) => ({
      ...scenario,
      calibration: { feetPerWorldUnit: 0.5, a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, distanceFt: 5, reference: '', calibratedAt: START.toISOString() },
      apparatusLengthFt: { E1: 40 },
    }))
    const endAfter = (objects().find((object) => object.id === 'supply') as HoseObject).points.slice(-2)
    expect(endAfter[0]).toBeCloseTo(intakeAt().x, 6)
    expect(endAfter[1]).toBeCloseTo(intakeAt().y, 6)
    expect(endAfter[1]).not.toBeCloseTo(endBefore[1]!, 3)
  })

  it('updates training notes', () => {
    store().updateTraining((training) => ({ ...training, notes: 'Debrief at 1400' }))
    expect(store().board.training.notes).toBe('Debrief at 1400')
  })
})

describe('training timer and run recording', () => {
  it('starts, pauses, and resumes the timer', () => {
    store().startTimer()
    const { timer } = store().board.training
    expect(timer).toEqual({ running: true, startedAt: START.getTime(), accumulatedMs: 0 })

    vi.advanceTimersByTime(5000)
    expect(elapsedMs(store().board.training.timer)).toBe(5000)

    store().pauseTimer()
    expect(store().board.training.timer).toEqual({ running: false, startedAt: null, accumulatedMs: 5000 })

    vi.advanceTimersByTime(3000)
    expect(elapsedMs(store().board.training.timer)).toBe(5000)

    store().startTimer()
    vi.advanceTimersByTime(2000)
    expect(elapsedMs(store().board.training.timer)).toBe(7000)
  })

  it('ignores start while running and pause while stopped', () => {
    store().pauseTimer()
    expect(store().board.training.timer.running).toBe(false)
    store().startTimer()
    const board = store().board
    store().startTimer()
    expect(store().board).toBe(board)
  })

  it('creates the run on first start and keeps it across pauses', () => {
    expect(store().board.run).toBeNull()
    const base = objects()
    store().startTimer()
    const run = store().board.run
    expect(run).toEqual({ startedAt: START.toISOString(), base, entries: [] })
    store().pauseTimer()
    store().startTimer()
    expect(store().board.run).toBe(run)
  })

  it('does not record commits before a run starts', () => {
    addNote()
    expect(store().board.run).toBeNull()
  })

  it('appends change entries at the elapsed time once running', () => {
    store().startTimer()
    vi.advanceTimersByTime(12_000)
    const note = addNote('Command post')
    const entries = store().board.run!.entries
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ at: 12_000, kind: 'change', label: 'Add Command post', upserts: [note], removes: [] })

    vi.advanceTimersByTime(1000)
    store().undo()
    vi.advanceTimersByTime(1000)
    store().redo()
    expect(store().board.run!.entries.map((entry) => [entry.label, entry.at])).toEqual([
      ['Add Command post', 12_000],
      ['Undo', 13_000],
      ['Redo', 14_000],
    ])
    expect(store().board.run!.entries[1]?.removes).toEqual([note.id])
  })

  it('records benchmark completions with their elapsed time', () => {
    store().startTimer()
    vi.advanceTimersByTime(65_000)
    store().toggleBenchmark('command-established')
    expect(store().board.training.completed).toEqual({ 'command-established': 65_000 })
    vi.advanceTimersByTime(5000)
    store().toggleBenchmark('command-established')
    expect(store().board.training.completed).toEqual({})
    expect(store().board.run!.entries.map((entry) => [entry.kind, entry.label, entry.at])).toEqual([
      ['benchmark', 'Completed: Command established', 65_000],
      ['benchmark', 'Reopened: Command established', 70_000],
    ])
  })

  it('records benchmarks without a run and ignores unknown ids', () => {
    store().toggleBenchmark('initial-size-up')
    expect(store().board.training.completed).toEqual({ 'initial-size-up': 0 })
    expect(store().board.run).toBeNull()
    const board = store().board
    store().toggleBenchmark('unknown')
    expect(store().board).toBe(board)
  })

  it('reveals injects once and records the reveal time', () => {
    store().startTimer()
    vi.advanceTimersByTime(30_000)
    store().revealInject('occupant-report')
    vi.advanceTimersByTime(30_000)
    store().revealInject('occupant-report')
    store().revealInject('unknown')
    expect(store().board.training.revealed).toEqual({ 'occupant-report': 30_000 })
    expect(store().board.run!.entries).toEqual([expect.objectContaining({ kind: 'inject', label: 'Inject: Occupant report', at: 30_000 })])
  })

  it('conceals revealed injects', () => {
    store().revealInject('occupant-report')
    store().concealInject('occupant-report')
    expect(store().board.training.revealed).toEqual({})
    const board = store().board
    store().concealInject('occupant-report')
    expect(store().board).toBe(board)
  })

  it('resets the run, timer, reveals, and completions', () => {
    store().startTimer()
    vi.advanceTimersByTime(1000)
    store().toggleBenchmark('command-established')
    store().revealInject('occupant-report')
    store().updateTraining((training) => ({ ...training, notes: 'kept' }))
    store().resetRun()
    const { board } = store()
    expect(board.run).toBeNull()
    expect(board.training).toEqual({ timer: { running: false, startedAt: null, accumulatedMs: 0 }, revealed: {}, completed: {}, notes: 'kept' })
  })
})

describe('snapshots', () => {
  it('adds snapshots with trimmed or default names', () => {
    const named = store().addSnapshot('  Before attack  ')
    const unnamed = store().addSnapshot('   ')
    expect(named).toMatchObject({ name: 'Before attack', elapsedMs: null, createdAt: START.toISOString() })
    expect(unnamed.name).toBe('Snapshot')
    expect(store().board.snapshots.map((snapshot) => snapshot.id)).toEqual([named.id, unnamed.id])
  })

  it('records snapshot time and a timeline entry during a run', () => {
    store().startTimer()
    vi.advanceTimersByTime(4000)
    const snapshot = store().addSnapshot('Mid run')
    expect(snapshot.elapsedMs).toBe(4000)
    expect(store().board.run!.entries).toEqual([expect.objectContaining({ kind: 'snapshot', label: 'Snapshot: Mid run' })])
  })

  it('restores a snapshot as an undoable commit', () => {
    const snapshot = store().addSnapshot('Start')
    addNote('one')
    addNote('two')
    store().restoreSnapshot(snapshot.id)
    expect(objects()).toEqual(snapshot.objects)
    expect(store().past).toHaveLength(3)
    store().undo()
    expect(objects()).toHaveLength(snapshot.objects.length + 2)
  })

  it('ignores unknown snapshots and deletes by id', () => {
    const snapshot = store().addSnapshot('Start')
    const before: SceneObject[] = objects()
    store().restoreSnapshot('missing')
    expect(objects()).toBe(before)
    store().deleteSnapshot(snapshot.id)
    expect(store().board.snapshots).toEqual([])
  })
})

describe('pauseStaleClock', () => {
  it('reopens a board saved with the clock running as paused at its last save', () => {
    const base = boardFromTemplate()
    const board = { ...base, updatedAt: '2026-10-25T12:10:00.000Z', training: { ...base.training, timer: { running: true, startedAt: Date.parse('2026-10-25T12:00:00.000Z'), accumulatedMs: 30_000 } } }
    const paused = pauseStaleClock(board)
    expect(paused.training.timer).toEqual({ running: false, startedAt: null, accumulatedMs: 30_000 + 10 * 60_000 })
  })

  it('leaves a stopped clock alone', () => {
    const board = boardFromTemplate()
    expect(pauseStaleClock(board)).toBe(board)
  })
})