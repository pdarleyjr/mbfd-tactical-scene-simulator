import { useState, type FormEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, ClipboardPenLine, Flame, Presentation, RadioTower } from 'lucide-react'
import { AppMark } from '../components/AppMark'
import { api, ApiError } from '../api/client'
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
  const [code, setCode] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [showInstructor, setShowInstructor] = useState(false)

  function join(event: FormEvent) {
    event.preventDefault()
    const normalized = code.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 6)
    if (normalized.length !== 6) return setError('Enter the six-character incident code.')
    void navigate({ to: '/join/$code', params: { code: normalized } })
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

  return (
    <main className="shell min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between p-5"><AppMark /><button className="btn btn-secondary" onClick={() => setShowInstructor((value) => !value)}><ClipboardPenLine size={19} /> Instructor</button></header>
      <section className="mx-auto grid max-w-6xl gap-10 px-5 pb-12 pt-10 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:pt-20">
        <div>
          <p className="eyebrow mb-4">Miami Beach Fire Department</p>
          <h1 className="display max-w-3xl text-5xl leading-[.95] md:text-7xl">Build the incident.<br/><span className="text-[#57a8df]">Train the decision.</span></h1>
          <p className="muted mt-6 max-w-2xl text-lg leading-relaxed">A shared, map-first tactical workspace for company placement, water supply, hose evolutions, command planning, and instructor-led review.</p>
          <div className="mt-8 grid max-w-2xl grid-cols-2 gap-px border border-[#34434c] bg-[#34434c] md:grid-cols-4">
            {features.map(({ label, Icon }) => <div key={label} className="flex min-h-24 flex-col justify-between bg-[#111a1f] p-3"><Icon size={20} className="text-[#d9c8a5]"/><span className="display text-sm">{label}</span></div>)}
          </div>
        </div>
        <div className="panel p-5 md:p-7">
          <p className="eyebrow">Enter an active incident</p>
          <h2 className="display mb-5 mt-2 text-3xl">Join Session</h2>
          <form onSubmit={join} className="space-y-4">
            <label className="block"><span className="mb-2 block font-semibold">Incident code</span><input className="field display text-center text-2xl tracking-[.3em]" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="ABC234" autoCapitalize="characters" autoComplete="off" maxLength={6} /></label>
            <button className="btn btn-primary w-full" type="submit">Continue <ArrowRight size={19}/></button>
          </form>
          {showInstructor && <form onSubmit={instructor} className="mt-6 border-t border-[#34434c] pt-5"><label><span className="mb-2 block font-semibold">Instructor PIN</span><input className="field" type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} autoComplete="current-password" /></label><button className="btn btn-secondary mt-3 w-full" type="submit">Open scenario builder</button></form>}
          {error && <p className="mt-4 border-l-4 border-[#be241f] bg-[#2a1919] p-3" role="alert">{error}</p>}
        </div>
      </section>
    </main>
  )
}
