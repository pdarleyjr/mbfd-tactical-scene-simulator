import { useState, type FormEvent } from 'react'
import { ArrowRight, Play, Users } from 'lucide-react'
import { recentScenes } from '../lib/recent'
import { hostedRooms } from '../lib/rooms'
import { sceneIdFromInput, scenePath } from '../lib/route'
import { formatRelative } from '../lib/format'
import { beginSimulation } from '../lib/workspace'

type Pending = 'solo' | 'shared' | null

/**
 * The first screen. Visiting the address never puts anyone into somebody
 * else's scene: the visitor either starts their own private simulation (the
 * default) or deliberately starts or joins a shared one.
 */
export function EntryScreen() {
  const [pending, setPending] = useState<Pending>(null)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  const hosted = hostedRooms()
  const own = hosted.filter((room) => room.kind === 'solo')
  const recent = recentScenes()
  const known = new Map(recent.map((item) => [item.id, item]))
  const ownList = own.map((room) => ({ id: room.id, name: known.get(room.id)?.name ?? 'My simulation', visitedAt: known.get(room.id)?.visitedAt ?? room.createdAt }))
    .sort((a, b) => b.visitedAt - a.visitedAt).slice(0, 4)
  const ownIds = new Set(own.map((room) => room.id))
  const sharedList = recent.filter((item) => !ownIds.has(item.id)).slice(0, 5)

  async function start(kind: 'solo' | 'shared') {
    if (pending) return
    setPending(kind)
    setError('')
    try {
      await beginSimulation(kind)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The simulation could not be started.')
      setPending(null)
    }
  }

  function join(event: FormEvent) {
    event.preventDefault()
    const id = sceneIdFromInput(code)
    if (!id) { setCodeError('Paste the invite link or type the code you were given.'); return }
    location.assign(scenePath(id))
  }

  return (
    <main className="entry" data-testid="entry-screen">
      <header className="entry__head">
        <img src="/mbfd-seal-96.webp" alt="" width={56} height={56} />
        <div>
          <h1>MBFD Tactical Scene Simulator</h1>
          <p>How do you want to work?</p>
        </div>
      </header>

      <div className="entry__choices">
        <section className="entry__choice entry__choice--primary" aria-labelledby="entry-own">
          <h2 id="entry-own">Your own simulation</h2>
          <p>A private board only you can open. Nothing you do is seen or changed by anyone else, and it is saved for you.</p>
          <button type="button" className="btn btn--primary entry__action" onClick={() => void start('solo')} disabled={pending !== null} data-testid="start-own"><Play size={20} aria-hidden />{pending === 'solo' ? 'Starting…' : 'Start My Own Simulation'}</button>
          {ownList.length > 0 && (
            <div className="entry__resume" data-testid="own-simulations">
              <h3>Continue one of yours</h3>
              <ul>
                {ownList.map((item, index) => (
                  <li key={item.id}>
                    <a className="entry__link" href={scenePath(item.id)} data-testid={index === 0 ? 'continue-own' : undefined}>
                      <span><strong>{item.name}</strong><small>opened {formatRelative(item.visitedAt)}</small></span>
                      <ArrowRight size={18} aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="entry__choice" aria-labelledby="entry-shared">
          <h2 id="entry-shared">A shared simulation</h2>
          <p>Work on one board together, or run a class. Only people who have your invite link can join.</p>
          <button type="button" className="btn entry__action" onClick={() => void start('shared')} disabled={pending !== null} data-testid="start-shared"><Users size={20} aria-hidden />{pending === 'shared' ? 'Starting…' : 'Start a Shared Simulation'}</button>
          <form className="entry__join" onSubmit={join} noValidate>
            <label htmlFor="entry-code">Join with an invite</label>
            <div className="entry__join-row">
              <input id="entry-code" className="input" value={code} onChange={(event) => { setCode(event.target.value); setCodeError('') }} placeholder="Paste the link or type the code" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={codeError ? true : undefined} aria-describedby={codeError ? 'entry-code-error' : undefined} data-testid="join-code" />
              <button type="submit" className="btn" data-testid="join-shared">Join</button>
            </div>
            {codeError && <p className="entry__error" id="entry-code-error" role="alert">{codeError}</p>}
          </form>
        </section>
      </div>

      {error && <p className="entry__error entry__error--block" role="alert" data-testid="entry-error">{error}</p>}

      {sharedList.length > 0 && (
        <section className="entry__recent" aria-labelledby="entry-recent" data-testid="recent-shared">
          <h2 id="entry-recent">Recently opened here</h2>
          <ul>
            {sharedList.map((item) => (
              <li key={item.id}>
                <a className="entry__link" href={scenePath(item.id)}>
                  <span><strong>{item.id === 'main' ? 'Main scene' : item.name}</strong><small>opened {formatRelative(item.visitedAt)}</small></span>
                  <ArrowRight size={18} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
