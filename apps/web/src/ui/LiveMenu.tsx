import { useEffect, useRef, useState } from 'react'
import { Copy, Home, Link2, Lock, LockOpen, MonitorPlay, Plus, Power, Smartphone, Users } from 'lucide-react'
import { useLive } from '../lib/live'
import { sceneLink } from '../lib/route'
import { hostAction, hostedRooms, ownerLink, type HostAction } from '../lib/rooms'
import { startOwnSimulation } from '../lib/workspace'
import { copyLink } from '../lib/clipboard'
import { useUi } from '../store/ui'

/** Live status, who is here, and what this person can do about the simulation they are in. */
export function LiveMenu() {
  const { sceneId, connection, peers, access } = useLive()
  const [open, setOpen] = useState(false)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [open])
  useEffect(() => { if (!open) setConfirmEnd(false) }, [open])

  const kind = access?.kind ?? 'shared'
  const host = access?.host ?? false
  const text = connection === 'live' ? (peers > 1 ? `Live · ${peers} here` : 'Live') : connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'
  const tone = connection === 'live' ? (peers > 1 ? 'busy' : 'ok') : 'warning'
  const run = (action: () => unknown) => () => { setOpen(false); void action() }

  async function change(action: HostAction, done: string) {
    try {
      await hostAction(sceneId, action)
      useUi.getState().toast(done, 'success')
    } catch (error) {
      useUi.getState().toast(error instanceof Error ? error.message : 'That did not work.', 'error')
    }
  }

  const title = kind === 'solo' ? 'My simulation' : kind === 'shared' ? 'Shared simulation' : 'Shared scene'
  const lead = kind === 'solo'
    ? 'Private: only you can open and change it. Saved on the server automatically.'
    : kind === 'legacy'
      ? 'Everyone with this older link edits it live. Start your own simulation to work privately.'
      : access?.locked
        ? 'Locked: nobody new can join. People already here keep working.'
        : 'Everyone with the invite link sees and edits it live. Saved on the server automatically.'
  const hosted = hostedRooms().find((room) => room.id === sceneId)

  return (
    <div className="menu live-menu" ref={ref}>
      <button
        type="button"
        className={`save-indicator save-indicator--${tone} live-menu__toggle`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-testid="live-status"
        data-connection={connection}
        data-peers={peers}
        data-kind={kind}
        title={kind === 'solo' ? 'Your own simulation. Only you can open it. Changes are saved on the server automatically.' : 'Everyone in this simulation works on the same scene. Changes are saved on the server automatically.'}
      >
        <span className="save-indicator__dot" aria-hidden />
        {peers > 1 && <Users size={15} aria-hidden />}
        {access?.locked && <Lock size={14} aria-hidden />}
        <span className="save-indicator__text" role="status" aria-live="polite">{text}</span>
      </button>
      {open && (
        <div className="menu__list live-menu__list" role="menu" data-testid="live-menu">
          <p className="live-menu__lead">
            <span className="live-menu__title"><strong>{title}</strong>{kind === 'solo' ? '' : peers > 1 ? ` · ${peers} people here now` : ' · only you right now'}</span>
            <span>{lead}</span>
          </p>
          {kind !== 'solo' && <button type="button" role="menuitem" className="menu__item" onClick={run(() => copyLink(sceneLink(sceneId), kind === 'shared' ? 'Invite link' : 'Link to this scene'))} data-testid="copy-scene-link"><Copy size={17} /><span>{kind === 'shared' ? 'Copy invite link' : 'Copy link to this scene'}</span></button>}
          <button type="button" role="menuitem" className="menu__item" onClick={run(() => copyLink(sceneLink(sceneId, { display: true }), 'Classroom display link'))} data-testid="copy-display-link"><MonitorPlay size={17} /><span>Copy classroom display link</span></button>
          {kind === 'solo' && host && <button type="button" role="menuitem" className="menu__item" onClick={run(() => change('share', 'Now shared. Copy the invite link to let others in.'))} data-testid="share-simulation"><Users size={17} /><span>Share with others</span></button>}
          {kind === 'shared' && host && (access?.locked
            ? <button type="button" role="menuitem" className="menu__item" onClick={run(() => change('unlock', 'Unlocked. People with the invite link can join again.'))} data-testid="unlock-simulation"><LockOpen size={17} /><span>Unlock so people can join</span></button>
            : <button type="button" role="menuitem" className="menu__item" onClick={run(() => change('lock', 'Locked. Nobody new can join; people here keep working.'))} data-testid="lock-simulation"><Lock size={17} /><span>Lock so nobody new can join</span></button>)}
          {host && hosted && <button type="button" role="menuitem" className="menu__item" onClick={run(() => copyLink(ownerLink(hosted), 'Owner link (gives full control, keep it private)'))} data-testid="copy-owner-link"><Smartphone size={17} /><span>Copy link to continue on another device</span></button>}
          {kind === 'shared' && host && (
            <button
              type="button"
              role="menuitem"
              className="menu__item menu__item--danger"
              onClick={() => { if (confirmEnd) { setOpen(false); void change('end', 'Simulation ended for everyone.') } else setConfirmEnd(true) }}
              data-testid="end-simulation"
            ><Power size={17} /><span>{confirmEnd ? 'Tap again to end for everyone' : 'End for everyone'}</span></button>
          )}
          <button type="button" role="menuitem" className="menu__item" onClick={run(() => startOwnSimulation())} data-testid="start-separate-scene"><Plus size={17} /><span>Start a new simulation of my own</span></button>
          <a role="menuitem" className="menu__item" href="/" data-testid="go-start-screen"><Home size={17} /><span>Back to the start screen</span></a>
          {kind === 'shared' && !host && <p className="live-menu__foot"><Link2 size={14} aria-hidden /> You joined with the invite link.</p>}
        </div>
      )}
    </div>
  )
}
