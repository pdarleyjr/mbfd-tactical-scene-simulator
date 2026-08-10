import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, ClipboardPenLine, Flame, LockKeyhole, Presentation, RadioTower, RefreshCw } from 'lucide-react'
import { AppMark } from '../components/AppMark'
import { api, ApiError } from '../api/client'
import type { RoomView } from '../api/types'
import { useAuthStore } from '../state/auth'

const features = [
  { label: 'Live scene', Icon: RadioTower },
  { label: '300 workspace', Icon: Presentation },
  { label: 'Hose semantics', Icon: Flame },
  { label: 'After action', Icon: ClipboardPenLine },
]

export function HomePage() {
  const navigate = useNavigate()
  const setInstructorToken = useAuthStore((state) => state.setInstructorToken)
  const [rooms, setRooms] = useState<RoomView[]>([])
  const [roomId, setRoomId] = useState('')
  const [loadingRooms, setLoadingRooms] = useState(true)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [showInstructor, setShowInstructor] = useState(false)
  const selectedRoom = useMemo(() => rooms.find((room) => room.id === roomId), [roomId, rooms])

  async function refreshRooms() {
    setLoadingRooms(true)
    try {
      const response = await api<{ items: RoomView[] }>('/api/rooms')
      setRooms(response.items)
      setRoomId((current) => response.items.some((room) => room.id === current) ? current : response.items.find((room) => room.currentSession)?.id ?? response.items[0]?.id ?? '')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Training rooms could not be loaded.')
    } finally { setLoadingRooms(false) }
  }

  useEffect(() => { void refreshRooms() }, [])

  function join(event: FormEvent) {
    event.preventDefault()
    if (!selectedRoom) return setError('Choose a training room.')
    if (!selectedRoom.currentSession) return setError('That room is not configured for a session yet. Ask the instructor to open it.')
    void navigate({ to: '/join/$roomId', params: { roomId: selectedRoom.id } })
  }

  async function instructor(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const response = await api<{ token: string }>('/api/instructor/session', { method: 'POST', body: { pin } })
      setInstructorToken(response.token)
      void navigate({ to: '/builder' })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not authenticate the instructor.')
    }
  }

  return <main className="shell viewport-page home-page">
    <header className="app-header home-header"><AppMark/><button className="btn btn-secondary" onClick={() => setShowInstructor((value) => !value)}><ClipboardPenLine size={19}/>Instructor setup</button></header>
    <section className="home-body">
      <div className="home-intro"><p className="eyebrow">Miami Beach Fire Department</p><h1 className="display">Build the incident.<br/><span className="text-[#57a8df]">Train the decision.</span></h1><p className="muted home-description">A shared, map-first tactical workspace for company placement, water supply, hose evolutions, command planning, and instructor-led review.</p><div className="home-features">{features.map(({ label, Icon }) => <div key={label}><Icon size={20} className="text-[#d9c8a5]"/><span className="display text-sm">{label}</span></div>)}</div></div>
      <div className="panel home-join"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Join training</p><h2 className="display mt-1 text-2xl md:text-3xl">Choose your scenario</h2></div><button type="button" className="btn btn-secondary !min-h-12 !px-3" aria-label="Refresh scenarios" onClick={() => void refreshRooms()}><RefreshCw size={18}/></button></div><p className="muted home-join-help">Select the scenario title your instructor opened. A PIN appears only when that instructor chose to lock its room.</p>
        <form onSubmit={join} className="space-y-4"><label className="block"><span className="mb-2 block font-semibold">Available scenarios</span><select className="field min-h-14" value={roomId} onChange={(event) => setRoomId(event.target.value)} disabled={loadingRooms}><option value="">{loadingRooms ? 'Loading scenarios…' : rooms.length ? 'Choose a scenario' : 'No scenarios are open'}</option>{rooms.map((room) => <option key={room.id} value={room.id}>{room.currentSession?.scenarioTitle ?? room.name}{room.locked ? ' · PIN required' : ''}{room.currentSession ? ` · ${room.name}` : ' · awaiting instructor setup'}</option>)}</select></label>
          {selectedRoom && <div className="border border-[#34434c] bg-[#111a1f] p-3"><strong className="display block">{selectedRoom.currentSession?.scenarioTitle ?? selectedRoom.name}</strong><span className="muted mt-1 flex items-center gap-2 text-sm">{selectedRoom.locked && <LockKeyhole size={15}/>} {selectedRoom.currentSession ? `${selectedRoom.name} · ${selectedRoom.currentSession.status}` : 'Instructor setup is not complete'}</span></div>}
          <button className="btn btn-primary w-full" type="submit" disabled={!selectedRoom?.currentSession}>Continue to participant setup <ArrowRight size={19}/></button>
        </form>
        {showInstructor && <form onSubmit={instructor} className="instructor-login"><div><h3 className="display text-lg">Instructor setup</h3><p className="muted text-sm">Instructor PIN: <strong className="text-[#f4ecd9]">2300</strong></p></div><label><span className="field-label">Instructor PIN</span><input className="field" type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="current-password"/></label><button className="btn btn-secondary w-full" type="submit">Open instructor setup</button></form>}
        {error && <p className="mt-4 border-l-4 border-[#be241f] bg-[#2a1919] p-3" role="alert">{error}</p>}
      </div>
    </section>
  </main>
}
