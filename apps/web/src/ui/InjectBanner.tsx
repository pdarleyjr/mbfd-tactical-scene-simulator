import { Megaphone, X } from 'lucide-react'
import { useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { formatElapsed } from '../lib/format'

/** A revealed inject, shown over the map until dismissed. */
export function InjectBanner() {
  const id = useUi((state) => state.bannerInjectId)
  const presenting = useUi((state) => state.presenting)
  const inject = useBoard((state) => state.board.scenario.injects.find((item) => item.id === id))
  const at = useBoard((state) => (id ? state.board.training.revealed[id] : undefined))
  if (!inject) return null
  return (
    <div className={`inject-banner ${presenting ? 'inject-banner--presenting' : ''}`} role="alert" data-testid="inject-banner">
      <Megaphone size={presenting ? 30 : 22} aria-hidden />
      <div className="inject-banner__text">
        <span className="inject-banner__eyebrow">Inject{at !== undefined ? ` · ${formatElapsed(at)}` : ''}</span>
        <strong>{inject.title}</strong>
        {inject.description && <p>{inject.description}</p>}
      </div>
      <button type="button" className="icon-btn" aria-label="Dismiss inject" onClick={() => useUi.getState().showInjectBanner(null)}><X size={20} /></button>
    </div>
  )
}
