import { useUi } from '../store/ui'
import { Inspector } from './Inspector'
import { SupplyPanel } from './SupplyPanel'
import { TrainingPanel } from './TrainingPanel'

/** Right-hand panel: the selection when there is one, otherwise the open panel. */
export function SidePanel() {
  const hasSelection = useUi((state) => state.selection.length > 0)
  const panel = useUi((state) => state.panel)
  const reviewing = useUi((state) => state.reviewing)
  const presenting = useUi((state) => state.presenting)
  if (reviewing) return null
  const content = hasSelection ? <Inspector /> : panel === 'training' ? <TrainingPanel /> : panel === 'supply' ? <SupplyPanel /> : null
  if (!content) return null
  return <aside className={`side-panel ${presenting ? 'side-panel--presenting' : ''}`} aria-label="Details">{content}</aside>
}
