import { Film, LogOut, Users } from 'lucide-react'
import { AppMark } from '../AppMark'
import { StatusPill } from '../StatusPill'

export function IncidentHeader(props: { title: string; code: string; unit: string; name: string; status: 'connecting' | 'connected' | 'offline' | 'error'; participantCount: number; onVideo: () => void; onLeave: () => void }) {
  return <header className="incident-header flex items-center gap-3 px-3 md:px-4"><AppMark compact/><div className="min-w-0 flex-1"><strong className="display block truncate text-sm md:text-base">{props.title}</strong><span className="muted hidden text-xs sm:block">Incident {props.code} · {props.unit} · {props.name}</span></div><span className="hidden min-h-10 items-center gap-2 px-2 text-sm md:flex"><Users size={17}/>{props.participantCount}</span><StatusPill status={props.status}/><button className="btn btn-secondary !min-h-11 !px-3" onClick={props.onVideo}><Film size={18}/><span className="hidden sm:inline">Initial conditions</span></button><button className="btn btn-secondary !min-h-11 !w-11 !p-0" onClick={props.onLeave} aria-label="Leave incident"><LogOut size={18}/></button></header>
}
