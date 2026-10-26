import { X } from 'lucide-react'
import { useUi } from '../store/ui'
import { useSaveStatus, reloadFromStorage } from '../lib/workspace'

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

/** Persistent notices: storage that will not survive, or edits from another tab. */
export function Banners() {
  const durable = useSaveStatus((state) => state.durable)
  const saveError = useSaveStatus((state) => state.state === 'error' ? state.message ?? 'Saving failed.' : null)
  const otherTab = useUi((state) => state.otherTabChanged)
  if (otherTab) {
    return (
      <div className="banner banner--info" role="alert">
        <span>This scene was changed in another tab or window.</span>
        <button type="button" className="btn btn--primary" onClick={() => void reloadFromStorage()}>Load latest</button>
        <button type="button" className="btn btn--quiet" onClick={() => useUi.getState().setOtherTabChanged(false)}>Keep this version</button>
      </div>
    )
  }
  if (saveError) return <div className="banner banner--warning" role="alert"><span>Your latest changes are not saved: {saveError} Download a scene file to keep them.</span></div>
  if (!durable) return <div className="banner banner--warning" role="alert"><span>This browser is not keeping data (private browsing). Download a scene file before you close this tab.</span></div>
  return null
}
