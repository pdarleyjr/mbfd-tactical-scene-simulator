import { Crosshair, Hand, Map, MousePointer2, RotateCcw, Route, Trash2, ZoomIn } from 'lucide-react'
import type { CanvasMode } from '../../state/ui'

export function ContextToolbar(props: { mode: CanvasMode; selected: boolean; canDelete: boolean; command300: boolean; workspace: 'operations' | '300-plan'; onMode: (mode: CanvasMode) => void; onFit: () => void; onDelete: () => void; onWorkspace: (workspace: 'operations' | '300-plan') => void }) {
  const tool = (mode: CanvasMode, label: string, icon: React.ReactNode) => <button className={`btn !min-h-10 !px-3 ${props.mode === mode ? 'btn-primary' : 'btn-secondary'}`} onClick={() => props.onMode(mode)} aria-pressed={props.mode === mode}>{icon}<span className="hidden lg:inline">{label}</span></button>
  return <nav className="context-bar" aria-label="Map tools">
    {tool('select', 'Select', <MousePointer2 size={17}/>)}
    {tool('pan', 'Pan', <Hand size={17}/>)}
    {tool('hose-attack175', '1¾ hose', <Route size={17}/>)}
    {tool('hose-hose3', '3-inch', <Route size={17}/>)}
    {tool('hose-supply5', '5-inch', <Route size={17}/>)}
    <button className="btn btn-secondary !min-h-10 !px-3" onClick={props.onFit}><Crosshair size={17}/><span className="hidden lg:inline">Fit</span></button>
    {props.command300 && <div className="ml-auto flex gap-1"><button className={`btn !min-h-10 !px-3 ${props.workspace === '300-plan' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => props.onWorkspace('300-plan')}><Map size={17}/>Private 300</button><button className={`btn !min-h-10 !px-3 ${props.workspace === 'operations' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => props.onWorkspace('operations')}><ZoomIn size={17}/>Operations</button></div>}
    {props.selected && <button disabled={!props.canDelete} className="btn btn-danger !min-h-10 !px-3" onClick={props.onDelete}><Trash2 size={17}/><span className="hidden lg:inline">Delete</span></button>}
    {props.mode.startsWith('hose-') && <span className="muted flex min-h-10 items-center px-2 text-sm"><RotateCcw size={15} className="mr-1"/>Tap points, then Finish hose</span>}
  </nav>
}
