import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ClipboardCheck, Droplets, Download, FileImage, Keyboard, MonitorPlay, MoreHorizontal, Pause, Play, Settings2, Undo2 } from 'lucide-react'
import { useWaterSupply } from '../store/selectors'
import { useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { exportCurrentBoard, exportImage } from '../lib/workspace'
import { LiveMenu } from './LiveMenu'
import { useLive } from '../lib/live'
import { MAIN_SCENE_ID } from '@mbfd/domain'
import { useElapsed } from '../hooks/useElapsed'
import { formatElapsed } from '../lib/format'
import { enterPresentation } from '../lib/presentation'

export function TopBar() {
  const board = useBoard((state) => state.board)
  const sceneId = useLive((state) => state.sceneId)
  const togglePanel = useUi((state) => state.togglePanel)
  const panel = useUi((state) => state.panel)
  const openDialog = useUi((state) => state.openDialog)
  const timer = board.training.timer
  const elapsed = useElapsed(timer)
  const completed = Object.keys(board.training.completed).filter((id) => board.scenario.benchmarks.some((benchmark) => benchmark.id === id)).length
  const supply = useWaterSupply()
  const supplied = [...supply.apparatus.values()].filter((unit) => unit.supplied).length
  const warnings = supply.issues.filter((issue) => issue.severity === 'warning').length

  return (
    <header className="topbar" data-testid="topbar">
      <div className="topbar__left">
        <img className="topbar__mark" src="/mbfd-seal-96.webp" alt="Miami Beach Fire Department" width={40} height={40} />
        <button type="button" className="topbar__title" onClick={() => openDialog('library')} aria-label="Open scenes and saved versions" data-testid="scene-title">
          <span className="topbar__eyebrow">{sceneId === MAIN_SCENE_ID ? 'Main scene' : 'Separate scene'}{board.name !== board.scenario.title ? ` · ${board.name}` : ''}</span>
          <span className="topbar__name">{board.scenario.title}<ChevronDown size={16} aria-hidden /></span>
        </button>
        <LiveMenu />
      </div>
      <div className="topbar__right">
        <div className="timer-chip" data-running={timer.running} data-testid="timer-chip">
          <button type="button" className="timer-chip__toggle" onClick={() => timer.running ? useBoard.getState().pauseTimer() : useBoard.getState().startTimer()} aria-label={timer.running ? 'Pause scenario timer' : 'Start scenario timer'}>
            {timer.running ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <output className="timer-chip__time" aria-label="Scenario elapsed time">{formatElapsed(elapsed)}</output>
        </div>
        <button type="button" className={`chip ${panel === 'training' ? 'is-active' : ''}`} onClick={() => togglePanel('training')} data-testid="training-toggle">
          <ClipboardCheck size={17} aria-hidden />
          <span className="chip__label">Training</span>
          <span className="chip__count">{completed}/{board.scenario.benchmarks.length}</span>
        </button>
        <button type="button" className={`chip ${panel === 'supply' ? 'is-active' : ''}`} onClick={() => togglePanel('supply')} data-testid="supply-toggle">
          <Droplets size={17} aria-hidden />
          <span className="chip__label">Water</span>
          <span className={`chip__dot ${warnings ? 'is-warning' : supplied ? 'is-ok' : ''}`} aria-label={warnings ? `${warnings} water supply warnings` : supplied ? `${supplied} apparatus supplied` : 'No water supply established'} />
        </button>
        <button type="button" className="chip chip--primary" onClick={() => enterPresentation()} data-testid="present-button">
          <MonitorPlay size={17} aria-hidden />
          <span className="chip__label">Present</span>
        </button>
        <OverflowMenu
          items={[
            { label: 'Scenario settings', icon: <Settings2 size={17} />, run: () => openDialog('settings') },
            { label: 'Download scene file', icon: <Download size={17} />, run: () => void exportCurrentBoard() },
            { label: 'Download image (PNG)', icon: <FileImage size={17} />, run: () => void exportImage() },
            { label: 'Reset to original scenario', icon: <Undo2 size={17} />, run: () => openDialog('reset') },
            { label: 'Keyboard shortcuts', icon: <Keyboard size={17} />, run: () => openDialog('shortcuts') },
          ]}
        />
      </div>
    </header>
  )
}

function OverflowMenu({ items }: { items: Array<{ label: string; icon: ReactNode; run: () => void }> }) {
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
  return (
    <div className="menu" ref={ref}>
      <button type="button" className="icon-btn" aria-label="More options" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} data-testid="more-menu">
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div className="menu__list" role="menu">
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className="menu__item" onClick={() => { setOpen(false); item.run() }}>
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
