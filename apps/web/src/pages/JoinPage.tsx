import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { AppMark } from '../components/AppMark'
import { api, ApiError } from '../api/client'
import type { ScenarioView, SessionView } from '../api/types'
import { decodeClaims, useAuthStore } from '../state/auth'

export function JoinPage() {
  const { code } = useParams({ from: '/join/$code' })
  const navigate = useNavigate()
  const clientId = useAuthStore((state) => state.clientId)
  const setParticipant = useAuthStore((state) => state.setParticipant)
  const [lookup, setLookup] = useState<{ session: SessionView; scenario?: ScenarioView }>()
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [role, setRole] = useState<'crew' | 'command300'>('crew')
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ session: SessionView; scenario?: ScenarioView }>(`/api/sessions/code/${code}`).then((result) => {
      setLookup(result)
      setUnit(result.session.participatingUnits[0] ?? '')
    }).catch((caught) => setError(caught instanceof ApiError ? caught.message : 'Could not find that incident.'))
  }, [code])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const selectedUnit = role === 'command300' ? '300' : unit
      const response = await api<{ token: string; session: SessionView }>('/api/sessions/join', { method: 'POST', body: { code, name, role, unit: selectedUnit, clientId } })
      setParticipant({ token: response.token, claims: decodeClaims(response.token) })
      void navigate({ to: '/session/$sessionId', params: { sessionId: response.session.id } })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not join this incident.')
    }
  }

  return <main className="shell min-h-dvh"><header className="mx-auto max-w-3xl p-5"><AppMark /></header><section className="mx-auto max-w-xl px-5 py-10"><div className="panel p-5 md:p-7"><p className="eyebrow">Incident {code}</p><h1 className="display mt-2 text-3xl">{lookup?.scenario?.title ?? 'Loading incident…'}</h1><p className="muted mt-2">{lookup?.scenario?.dispatchInformation}</p>
    <form onSubmit={submit} className="mt-7 space-y-4">
      <label className="block"><span className="mb-2 block font-semibold">Your name</span><input className="field" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} autoComplete="name" /></label>
      <fieldset><legend className="mb-2 font-semibold">Assignment</legend><div className="grid grid-cols-2 gap-2"><button type="button" className={`btn ${role === 'crew' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setRole('crew')}>Company</button><button type="button" className={`btn ${role === 'command300' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setRole('command300'); setUnit('300') }}>Command 300</button></div></fieldset>
      {role === 'crew' && <label className="block"><span className="mb-2 block font-semibold">Unit</span><select className="field" value={unit} onChange={(event) => setUnit(event.target.value)} required>{lookup?.session.participatingUnits.filter((item) => item !== '300').map((item) => <option key={item}>{item}</option>)}</select></label>}
      <button className="btn btn-primary w-full" disabled={!lookup || !name || !unit}>Enter tactical scene</button>
    </form>{error && <p className="mt-4 border-l-4 border-[#be241f] bg-[#2a1919] p-3" role="alert">{error}</p>}</div></section></main>
}
