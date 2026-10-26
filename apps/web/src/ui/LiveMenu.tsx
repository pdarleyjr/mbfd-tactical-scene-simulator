import { useEffect, useRef, useState } from 'react'
import { Copy, Home, MonitorPlay, Plus, Users } from 'lucide-react'
import { MAIN_SCENE_ID } from '@mbfd/domain'
import { useLive, goToScene, sceneLink } from '../lib/live'
import { openAsSeparateScene } from '../lib/workspace'
import { copyLink } from '../lib/clipboard'

/** Live status, who is here, and the links for sharing or splitting off a scene. */
export function LiveMenu() {
  const { sceneId, connection, peers } = useLive()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [open])

  const isMain = sceneId === MAIN_SCENE_ID
  const text = connection === 'live' ? (peers > 1 ? `Live · ${peers} here` : 'Live') : connection === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'
  const tone = connection === 'live' ? (peers > 1 ? 'busy' : 'ok') : 'warning'
  const run = (action: () => unknown) => () => { setOpen(false); void action() }

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
        title="Everyone with this link works on the same scene. Changes are saved on the server automatically."
      >
        <span className="save-indicator__dot" aria-hidden />
        {peers > 1 && <Users size={15} aria-hidden />}
        <span className="save-indicator__text" role="status" aria-live="polite">{text}</span>
      </button>
      {open && (
        <div className="menu__list live-menu__list" role="menu" data-testid="live-menu">
          <p className="live-menu__lead">
            <span className="live-menu__title"><strong>{isMain ? 'Main scene' : 'Separate scene'}</strong>{peers > 1 ? ` · ${peers} people here now` : ' · only you right now'}</span>
            <span>Everyone with the link sees and edits it live. Saved on the server automatically.</span>
          </p>
          <button type="button" role="menuitem" className="menu__item" onClick={run(() => copyLink(sceneLink(sceneId), 'Link to this scene'))} data-testid="copy-scene-link"><Copy size={17} /><span>Copy link to this scene</span></button>
          <button type="button" role="menuitem" className="menu__item" onClick={run(() => copyLink(sceneLink(sceneId, { display: true }), 'Classroom display link'))} data-testid="copy-display-link"><MonitorPlay size={17} /><span>Copy classroom display link</span></button>
          <button type="button" role="menuitem" className="menu__item" onClick={run(() => openAsSeparateScene())} data-testid="start-separate-scene"><Plus size={17} /><span>Start a separate scene</span></button>
          {!isMain && <button type="button" role="menuitem" className="menu__item" onClick={run(() => goToScene(MAIN_SCENE_ID))} data-testid="go-main-scene"><Home size={17} /><span>Go to the main scene</span></button>}
        </div>
      )}
    </div>
  )
}
