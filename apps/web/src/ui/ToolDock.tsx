import type { ReactNode } from 'react'
import { FireExtinguisher, MapPin, MousePointer2, MoveUpRight, Redo2, Ruler, StickyNote, Truck, Undo2, Waves } from 'lucide-react'
import { useBoard } from '../store/board'
import { useUi, type Tool } from '../store/ui'

interface DockItem {
  tool: Tool
  label: string
  shortcut: string
  icon: ReactNode
}

const items: DockItem[] = [
  { tool: 'select', label: 'Select', shortcut: 'V', icon: <MousePointer2 size={22} /> },
  { tool: 'apparatus', label: 'Apparatus', shortcut: 'A', icon: <Truck size={22} /> },
  { tool: 'hose', label: 'Hose', shortcut: 'H', icon: <Waves size={22} /> },
  { tool: 'hydrant', label: 'Hydrant', shortcut: 'Y', icon: <FireExtinguisher size={22} /> },
  { tool: 'marker', label: 'Markers', shortcut: 'M', icon: <MapPin size={22} /> },
  { tool: 'note', label: 'Note', shortcut: 'T', icon: <StickyNote size={22} /> },
  { tool: 'arrow', label: 'Arrow', shortcut: 'D', icon: <MoveUpRight size={22} /> },
  { tool: 'measure', label: 'Measure', shortcut: 'R', icon: <Ruler size={22} /> },
]

export function ToolDock() {
  const tool = useUi((state) => state.tool)
  const setTool = useUi((state) => state.setTool)
  const canUndo = useBoard((state) => state.past.length > 0)
  const canRedo = useBoard((state) => state.future.length > 0)
  return (
    <nav className="dock" aria-label="Tools" data-testid="tool-dock">
      <div className="dock__tools" role="toolbar" aria-orientation="vertical">
        {items.map((item) => {
          const active = tool === item.tool || (item.tool === 'measure' && tool === 'calibrate')
          return (
            <button
              key={item.tool}
              type="button"
              className={`dock__btn ${active ? 'is-active' : ''}`}
              aria-pressed={active}
              title={`${item.label} (${item.shortcut})`}
              data-tool={item.tool}
              onClick={() => setTool(active && item.tool !== 'select' ? 'select' : item.tool)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          )
        })}
      </div>
      <div className="dock__history">
        <button type="button" className="dock__btn dock__btn--small" disabled={!canUndo} onClick={() => useBoard.getState().undo()} title="Undo (Ctrl+Z)" aria-label="Undo">
          <Undo2 size={20} />
        </button>
        <button type="button" className="dock__btn dock__btn--small" disabled={!canRedo} onClick={() => useBoard.getState().redo()} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          <Redo2 size={20} />
        </button>
      </div>
    </nav>
  )
}
