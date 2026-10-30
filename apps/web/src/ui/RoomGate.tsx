import { useState } from 'react'
import { useLive } from '../lib/live'
import { hostAction, hostKeyFor } from '../lib/rooms'
import { beginSimulation } from '../lib/workspace'

const TITLES: Record<string, string> = {
  'not-found': 'Simulation not found',
  forbidden: 'This simulation is private',
  locked: 'This simulation is locked',
  ended: 'This simulation has ended',
  full: 'This simulation is full',
}

/**
 * Shown instead of the scene when the server will not let this browser in. It
 * explains why in plain words and always offers a way forward: start your own,
 * or go back to the start screen.
 */
export function RoomGate() {
  const denied = useLive((state) => state.denied)
  const sceneId = useLive((state) => state.sceneId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!denied) return null
  const canReopen = denied.code === 'ended' && Boolean(hostKeyFor(sceneId))

  async function run(action: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setError('')
    try { await action() } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work. Try again.')
      setBusy(false)
    }
  }

  return (
    <div className="gate" role="alertdialog" aria-modal="true" aria-labelledby="gate-title" aria-describedby="gate-text" data-testid="room-gate" data-code={denied.code}>
      <div className="gate__panel">
        <h1 id="gate-title">{TITLES[denied.code] ?? 'This simulation cannot be opened'}</h1>
        <p id="gate-text">{denied.message}</p>
        {error && <p className="entry__error" role="alert">{error}</p>}
        <div className="gate__actions">
          {canReopen && <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void run(async () => { await hostAction(sceneId, 'reopen'); location.reload() })} data-testid="gate-reopen">Reopen this simulation</button>}
          <button type="button" className={`btn ${canReopen ? '' : 'btn--primary'}`} disabled={busy} onClick={() => void run(() => beginSimulation('solo'))} data-testid="gate-start-own">Start My Own Simulation</button>
          <a className="btn btn--quiet" href="/" data-testid="gate-back">Back to start</a>
        </div>
      </div>
    </div>
  )
}
