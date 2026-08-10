import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { LockKeyhole } from 'lucide-react'
import { AppMark } from '../components/AppMark'
import { api, ApiError } from '../api/client'
import type { RoomView, SessionView } from '../api/types'
import { decodeClaims, useAuthStore } from '../state/auth'

export function JoinPage() {
  const { roomId } = useParams({ from: '/join/$roomId' })
  const navigate = useNavigate()
  const clientId = useAuthStore((state) => state.clientId)
  const setParticipant = useAuthStore((state) => state.setParticipant)
  const [room, setRoom] = useState<RoomView>()
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [roomPin, setRoomPin] = useState('')
  const [role, setRole] = useState<'crew' | 'command300'>('crew')
  const [error, setError] = useState('')

  useEffect(() => {
    api<RoomView>(`/api/rooms/${roomId}`).then((result) => { setRoom(result); setUnit(result.currentSession?.participatingUnits.find((item) => item !== '300') ?? '') }).catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Could not find that room.'))
  }, [roomId])

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!room?.currentSession) return setError('This room does not have an open session.')
    try {
      const selectedUnit = role === 'command300' ? '300' : unit
      const response = await api<{ token: string; session: SessionView }>('/api/sessions/join', { method: 'POST', body: { sessionId: room.currentSession.id, ...(room.locked ? { roomPin } : {}), name, role, unit: selectedUnit, clientId } })
      setParticipant({ token: response.token, claims: decodeClaims(response.token) })
      void navigate({ to: '/session/$sessionId', params: { sessionId: response.session.id } })
    } catch (caught) { setError(caught instanceof ApiError ? caught.message : 'Could not join this room.') }
  }

  const units = room?.currentSession?.participatingUnits ?? []
  return <main className="shell viewport-page join-page"><header className="app-header join-header"><AppMark/><Link to="/" className="btn btn-secondary no-underline">Change room</Link></header><section className="join-body"><div className="panel join-card"><p className="eyebrow">Participant setup</p><h1 className="display mt-1 truncate text-3xl">{room?.name ?? 'Loading room…'}</h1><p className="muted truncate">{room?.currentSession?.scenarioTitle}</p>
    <form onSubmit={submit} className="join-form"><label className="block"><span className="field-label">Your name</span><input className="field" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} autoComplete="name"/></label>
      {room?.locked && <label className="block"><span className="mb-2 flex items-center gap-2 font-semibold"><LockKeyhole size={17}/>Room PIN</span><input className="field" value={roomPin} onChange={(event) => setRoomPin(event.target.value.replace(/\D/g, '').slice(0, 12))} inputMode="numeric" required autoComplete="one-time-code"/><small className="muted mt-1 block">This PIN was chosen by the instructor for this room.</small></label>}
      <fieldset><legend className="mb-2 font-semibold">Assignment</legend><div className="grid grid-cols-2 gap-2"><button type="button" className={`btn ${role === 'crew' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setRole('crew'); setUnit(units.find((item) => item !== '300') ?? '') }}>Company</button><button type="button" className={`btn ${role === 'command300' ? 'btn-primary' : 'btn-secondary'}`} disabled={!units.includes('300')} onClick={() => { setRole('command300'); setUnit('300') }}>Command 300</button></div></fieldset>
      {role === 'crew' && <label className="block"><span className="mb-2 block font-semibold">Assigned unit</span><select className="field" value={unit} onChange={(event) => setUnit(event.target.value)} required>{units.filter((item) => item !== '300').map((item) => <option key={item}>{item}</option>)}</select></label>}
      <button className="btn btn-primary w-full" disabled={!room?.currentSession || !name || !unit || (room.locked && !roomPin)}>Enter training room</button>
    </form>{error && <p className="mt-4 border-l-4 border-[#be241f] bg-[#2a1919] p-3" role="alert">{error}</p>}</div></section></main>
}
