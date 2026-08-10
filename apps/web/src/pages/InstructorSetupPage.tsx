import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Archive, ArrowLeft, Check, Play, RotateCcw, Settings2 } from 'lucide-react'
import { AppMark } from '../components/AppMark'
import { api } from '../api/client'
import type { RoomView, ScenarioView, SessionView } from '../api/types'
import { useAuthStore } from '../state/auth'

const WATERFRONT_SCENARIO_ID = '11111111-1111-4111-8111-111111111111'

type SetupView = 'setup' | 'benchmarks' | 'rooms'
type RoomList = 'open' | 'closed'

interface InstructorLibrary {
  scenarios: ScenarioView[]
  rooms: RoomView[]
}

function scenarioLabel(scenario: ScenarioView): string {
  return scenario.id === WATERFRONT_SCENARIO_ID
    ? `${scenario.title} — Waterfront default (fully built)`
    : scenario.title
}

export function InstructorSetupPage() {
  const navigate = useNavigate()
  const token = useAuthStore((state) => state.instructorToken)
  const [library, setLibrary] = useState<InstructorLibrary>({ scenarios: [], rooms: [] })
  const [scenarioId, setScenarioId] = useState('')
  const [roomChoice, setRoomChoice] = useState<'new' | string>('new')
  const [roomName, setRoomName] = useState('Waterfront Training Room')
  const [units, setUnits] = useState('E1, E2, E3, E4, L1, L3, 300')
  const [mode300, setMode300] = useState<'independent' | 'live'>('independent')
  const [lockRoom, setLockRoom] = useState(false)
  const [roomPin, setRoomPin] = useState('')
  const [benchmarkIds, setBenchmarkIds] = useState<string[]>([])
  const [view, setView] = useState<SetupView>('setup')
  const [roomList, setRoomList] = useState<RoomList>('open')
  const [roomPage, setRoomPage] = useState(0)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const loadLibrary = useCallback(async () => {
    if (!token) return
    const result = await api<InstructorLibrary>('/api/instructor/library', { token })
    setLibrary(result)
    const active = result.scenarios.filter((scenario) => !scenario.archived)
    const currentIsActive = active.some((scenario) => scenario.id === scenarioId)
    const next = currentIsActive
      ? active.find((scenario) => scenario.id === scenarioId)
      : active.find((scenario) => scenario.id === WATERFRONT_SCENARIO_ID) ?? active[0]
    if (next && next.id !== scenarioId) {
      setScenarioId(next.id)
      setRoomName(`${next.title} Training Room`)
      setBenchmarkIds(next.benchmarks.map((benchmark) => benchmark.id))
    }
  }, [scenarioId, token])

  useEffect(() => {
    void loadLibrary().catch((error) => setMessage(error instanceof Error ? error.message : 'Could not load instructor setup.'))
  }, [loadLibrary])

  const activeScenarios = useMemo(() => library.scenarios.filter((scenario) => !scenario.archived), [library.scenarios])
  const activeRooms = useMemo(() => library.rooms.filter((room) => !room.archived), [library.rooms])
  const closedRooms = useMemo(() => library.rooms.filter((room) => room.archived), [library.rooms])
  const selectedScenario = activeScenarios.find((scenario) => scenario.id === scenarioId)
  const selectedRoom = activeRooms.find((room) => room.id === roomChoice)
  const managedRooms = roomList === 'open' ? activeRooms : closedRooms
  const roomPages = Math.max(1, Math.ceil(managedRooms.length / 5))
  const visibleRooms = managedRooms.slice(roomPage * 5, roomPage * 5 + 5)

  if (!token) return <main className="shell grid min-h-dvh place-items-center p-5 text-center"><div><h1 className="display text-3xl">Instructor sign-in required</h1><Link to="/" className="btn btn-primary mt-5 no-underline">Return to sign in</Link></div></main>

  function chooseScenario(nextId: string) {
    const scenario = activeScenarios.find((item) => item.id === nextId)
    setScenarioId(nextId)
    if (scenario) {
      setRoomName(`${scenario.title} Training Room`)
      setBenchmarkIds(scenario.benchmarks.map((benchmark) => benchmark.id))
    }
  }

  function chooseRoom(nextChoice: string) {
    setRoomChoice(nextChoice)
    const room = activeRooms.find((item) => item.id === nextChoice)
    setLockRoom(room?.locked ?? false)
    setRoomPin('')
  }

  async function updateRoom(room: RoomView, archived: boolean) {
    if (!archived && room.currentSession?.status === 'running') return
    if (archived && !confirm(`Move “${room.name}” to closed rooms? You can restore it later.`)) return
    setBusy(true)
    try {
      await api(`/api/rooms/${room.id}`, { method: 'PATCH', token, body: { archived } })
      setMessage(archived ? 'Room moved to closed rooms. It can be restored at any time.' : 'Room restored and available again.')
      await loadLibrary()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Room could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  async function openRoom() {
    if (!selectedScenario) return setMessage('Choose a scenario before opening the room.')
    const participatingUnits = units.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean)
    if (!participatingUnits.length) return setMessage('Enter at least one participating unit.')
    setBusy(true)
    setMessage('Opening training room…')
    try {
      let roomId = roomChoice
      let room = selectedRoom
      if (roomChoice === 'new') {
        if (roomName.trim().length < 3) throw new Error('Enter a room name with at least three characters.')
        if (lockRoom && !roomPin) throw new Error('Enter the optional room PIN or turn off room locking.')
        room = await api<RoomView>('/api/rooms', { method: 'POST', token, body: { name: roomName, ...(lockRoom ? { accessPin: roomPin } : {}) } })
        roomId = room.id
      } else if (room) {
        const update: Record<string, unknown> = {}
        if (!lockRoom && room.locked) update.accessPin = null
        if (lockRoom && roomPin) update.accessPin = roomPin
        if (Object.keys(update).length) room = await api<RoomView>(`/api/rooms/${room.id}`, { method: 'PATCH', token, body: update })
      }
      if (!room || roomId === 'new') throw new Error('Choose an existing room or create a new one.')
      const configuration = { scenarioId: selectedScenario.id, participatingUnits, mode300, benchmarkIds }
      const session = room.currentSession?.status === 'setup'
        ? await api<SessionView>(`/api/sessions/${room.currentSession.id}/configuration`, { method: 'PUT', token, body: configuration })
        : await api<SessionView>('/api/sessions', { method: 'POST', token, body: { roomId, ...configuration } })
      void navigate({ to: '/instructor/$sessionId', params: { sessionId: session.id } })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Training room could not be opened.')
      setBusy(false)
    }
  }

  return <main className="shell viewport-page"><header className="app-header"><AppMark/><span className="ml-auto eyebrow">Instructor setup</span></header>
    <div className="quick-setup-workspace">
      <header className="quick-setup-header"><div><p className="eyebrow">Start here</p><h1 className="display text-2xl">{view === 'setup' ? 'Open a training room' : view === 'benchmarks' ? 'Choose benchmarks' : 'Manage training rooms'}</h1></div><div className="quick-header-actions">{view !== 'setup' && <button type="button" className="btn btn-secondary" onClick={() => setView('setup')}><ArrowLeft size={18}/>Back to setup</button>}<button type="button" className="btn btn-secondary" onClick={() => void navigate({ to: '/builder/$scenarioId', params: { scenarioId: scenarioId || 'new' } })}><Settings2 size={18}/>Manage scenarios</button></div></header>

      {view === 'setup' && <section className="quick-setup-panel" aria-label="Training room setup">
        <div className="quick-setup-primary">
          <div className="setup-step"><span className="setup-number">1</span><label><span className="field-label">Scenario</span><select aria-label="Scenario" className="field" value={scenarioId} onChange={(event) => chooseScenario(event.target.value)}>{activeScenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenarioLabel(scenario)}</option>)}</select></label><div className="inline-actions"><button type="button" className="btn btn-secondary" onClick={() => void navigate({ to: '/builder/new' })}>Create a custom scenario</button>{scenarioId && <button type="button" className="btn btn-ghost" onClick={() => void navigate({ to: '/builder/$scenarioId', params: { scenarioId } })}>Edit selected</button>}</div></div>
          <div className="setup-step"><span className="setup-number">2</span><label><span className="field-label">Training room</span><select aria-label="Training room" className="field" value={roomChoice} onChange={(event) => chooseRoom(event.target.value)}><option value="new">Create a new room</option>{activeRooms.map((room) => <option key={room.id} value={room.id}>{room.name}{room.currentSession?.status === 'setup' ? ' — resume setup' : ''}</option>)}</select></label>{roomChoice === 'new' && <label><span className="field-label">New room name</span><input className="field" value={roomName} onChange={(event) => setRoomName(event.target.value)} maxLength={100}/></label>}<button type="button" className="btn btn-ghost justify-self-start" onClick={() => setView('rooms')}>Manage or restore rooms</button></div>
        </div>
        <div className="quick-setup-options">
          <label><span className="field-label">Participating units</span><input className="field" value={units} onChange={(event) => setUnits(event.target.value)}/></label>
          <label><span className="field-label">Command 300 starts in</span><select className="field" value={mode300} onChange={(event) => setMode300(event.target.value as 'independent' | 'live')}><option value="independent">Independent plan</option><option value="live">Operations</option></select></label>
          <button type="button" className="benchmark-summary" onClick={() => setView('benchmarks')}><span><strong>Benchmarks</strong><small>{benchmarkIds.length} of {selectedScenario?.benchmarks.length ?? 0} selected</small></span><Settings2 size={18}/></button>
          <label className="room-lock-toggle"><input type="checkbox" checked={lockRoom} onChange={(event) => { setLockRoom(event.target.checked); if (!event.target.checked) setRoomPin('') }}/><span><strong>Require a room PIN</strong><small>Optional—leave off for open access.</small></span></label>
          {lockRoom && <label className="room-pin-field"><span className="field-label">{selectedRoom?.locked ? 'New PIN (blank keeps current)' : 'Room PIN'}</span><input className="field" value={roomPin} onChange={(event) => setRoomPin(event.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric"/></label>}
        </div>
        <footer className="quick-setup-footer"><p className="status-message" aria-live="polite">{message || (selectedScenario ? `${scenarioLabel(selectedScenario)} is ready.` : 'Create or restore a scenario to continue.')}</p><button type="button" className="btn btn-primary setup-open-button" disabled={busy || !selectedScenario} onClick={() => void openRoom()}><Play size={19}/>{busy ? 'Opening…' : 'Open instructor console'}</button></footer>
      </section>}

      {view === 'benchmarks' && <section className="quick-list-panel" aria-label="Room benchmarks"><p className="muted">These milestones will appear in the live instructor table. All are selected by default.</p><div className="quick-benchmark-grid">{selectedScenario?.benchmarks.map((benchmark) => <label key={benchmark.id} className="benchmark-choice"><input type="checkbox" checked={benchmarkIds.includes(benchmark.id)} onChange={(event) => setBenchmarkIds((items) => event.target.checked ? [...items, benchmark.id] : items.filter((id) => id !== benchmark.id))}/><span><strong>{benchmark.label}</strong><small>{benchmark.description}</small></span></label>)}</div><button type="button" className="btn btn-primary list-done" onClick={() => setView('setup')}><Check size={18}/>Use selected benchmarks</button></section>}

      {view === 'rooms' && <section className="quick-list-panel" aria-label="Room manager"><div className="segmented room-manager-tabs"><button type="button" className={roomList === 'open' ? 'active' : ''} onClick={() => { setRoomList('open'); setRoomPage(0) }}>Open rooms ({activeRooms.length})</button><button type="button" className={roomList === 'closed' ? 'active' : ''} onClick={() => { setRoomList('closed'); setRoomPage(0) }}>Closed rooms ({closedRooms.length})</button></div><div className="managed-list">{visibleRooms.map((room) => <div key={room.id} className="managed-row"><span><strong>{room.name}</strong><small>{room.currentSession ? `${room.currentSession.scenarioTitle} · ${room.currentSession.status}` : 'No active scenario'}</small></span>{roomList === 'closed' ? <button type="button" className="btn btn-secondary" disabled={busy} aria-label={`Restore ${room.name}`} onClick={() => void updateRoom(room, false)}><RotateCcw size={17}/>Restore</button> : <><button type="button" className="btn btn-secondary" aria-label={`Use ${room.name}`} onClick={() => { chooseRoom(room.id); setView('setup') }}>Use room</button><button type="button" className="btn btn-ghost" aria-label={`Close ${room.name}`} disabled={busy || room.currentSession?.status === 'running'} title={room.currentSession?.status === 'running' ? 'Complete the running scenario before closing this room.' : 'Move to closed rooms'} onClick={() => void updateRoom(room, true)}><Archive size={17}/>Close</button></>}</div>)}{!visibleRooms.length && <div className="empty-workspace"><strong className="display">{roomList === 'closed' ? 'No closed rooms' : 'No open rooms yet'}</strong><span className="muted">{roomList === 'closed' ? 'Rooms you close will remain recoverable here.' : 'Return to setup to create the first room.'}</span></div>}</div>{roomPages > 1 && <nav className="page-nav" aria-label="Room pages"><button type="button" className="btn btn-secondary" disabled={roomPage === 0} onClick={() => setRoomPage((page) => page - 1)}>Previous</button><output className="display tabular-nums">{roomPage + 1} / {roomPages}</output><button type="button" className="btn btn-secondary" disabled={roomPage >= roomPages - 1} onClick={() => setRoomPage((page) => page + 1)}>Next</button></nav>}<p className="status-message" aria-live="polite">{message}</p></section>}
    </div>
  </main>
}
