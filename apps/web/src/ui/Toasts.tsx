import { X } from 'lucide-react'
import { useUi } from '../store/ui'
import { useLive } from '../lib/live'
import { openAsSeparateScene } from '../lib/workspace'

export function Toasts() {
  const toasts = useUi((state) => state.toasts)
  const dismiss = useUi((state) => state.dismissToast)
  return (
    <div className="toasts" aria-live="polite" data-testid="toasts">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
          <span>{toast.message}</span>
          {toast.action && <button type="button" className="toast__action" onClick={() => { toast.action!.run(); dismiss(toast.id) }}>{toast.action.label}</button>}
          <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}><X size={15} /></button>
        </div>
      ))}
    </div>
  )
}

/** Persistent notices: a lost connection, or arriving while others are already working. */
export function Banners() {
  const connection = useLive((state) => state.connection)
  const peers = useLive((state) => state.peers)
  const arrived = useLive((state) => state.arrivedToCompany)
  const display = useUi((state) => state.display)
  if (connection === 'reconnecting') {
    return <div className="banner banner--warning" role="alert" data-testid="offline-banner"><span>Connection lost. Keep working: changes stay on this device and are shared as soon as it reconnects.</span></div>
  }
  if (arrived && !display && peers > 1) {
    const others = peers - 1
    return (
      <div className="banner banner--info" role="alert" data-testid="in-use-banner">
        <span>{others === 1 ? 'Someone is' : `${others} people are`} already working in this scene. Changes show up for everyone live.</span>
        <button type="button" className="btn btn--primary" onClick={() => useLive.getState().setArrivalNoticeSeen()}>Work together</button>
        <button type="button" className="btn btn--quiet" onClick={() => void openAsSeparateScene()} data-testid="banner-separate-scene">Start a separate scene</button>
      </div>
    )
  }
  return null
}