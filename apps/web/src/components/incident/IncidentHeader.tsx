import { Film, LogOut, TableProperties, Users } from 'lucide-react'
import { AppMark } from '../AppMark'
import { StatusPill } from '../StatusPill'
import { ScenarioTimer } from '../ScenarioTimer'

export function IncidentHeader(props: { title: string; roomName: string; unit: string; name: string; status: 'connecting' | 'connected' | 'offline' | 'error'; sessionStatus: 'setup' | 'running' | 'frozen' | 'complete'; elapsedMs: number; participantCount: number; onVideo: () => void; onActivity: () => void; onLeave: () => void }) {
  return <header className="incident-header flex items-center gap-3 px-3 md:px-4"><AppMark compact/><div className="min-w-0 flex-1"><strong className="display block truncate text-sm md:text-base">{props.title}</strong><span className="muted hidden text-xs sm:block">{props.roomName} · {props.unit} · {props.name}</span></div><ScenarioTimer compact elapsedMs={props.elapsedMs} status={props.sessionStatus}/><span className="hidden min-h-12 items-center gap-2 px-2 text-sm md:flex"><Users size={17}/>{props.participantCount}</span><StatusPill status={props.status}/><button className="btn btn-secondary !min-h-12 !w-12 !p-0" onClick={props.onActivity} aria-label="Open activity table"><TableProperties size={18}/></button><button className="btn btn-secondary !min-h-12 !px-3" onClick={props.onVideo}><Film size={18}/><span className="hidden sm:inline">Initial conditions</span></button><button className="btn btn-secondary !min-h-12 !w-12 !p-0" onClick={props.onLeave} aria-label="Leave incident"><LogOut size={18}/></button></header>
}
