import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { Download, Pause, Play } from 'lucide-react'
import type { DomainEvent } from '@mbfd/domain'
import { AppMark } from '../components/AppMark'
import { api } from '../api/client'
import { useAuthStore } from '../state/auth'
import { useBootstrap } from '../hooks/useBootstrap'

function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url)
}

export function ReviewPage() {
  const { sessionId } = useParams({ from: '/review/$sessionId' })
  const participantToken = useAuthStore((state)=>state.token)
  const instructorToken = useAuthStore((state)=>state.instructorToken)
  const token = instructorToken ?? participantToken
  const bootstrap = useBootstrap(sessionId, token)
  const [events,setEvents] = useState<DomainEvent[]>([])
  const [elapsed,setElapsed] = useState(0)
  const [playing,setPlaying] = useState(false)
  useEffect(()=>{ if(token) void api<{items:DomainEvent[]}>(`/api/sessions/${sessionId}/events`,{token}).then((result)=>setEvents(result.items)) },[sessionId,token])
  const duration = events.at(-1)?.elapsedMs ?? 0
  useEffect(()=>{ if(!playing)return; const id=setInterval(()=>setElapsed((value)=>Math.min(duration,value+250)),250); return()=>clearInterval(id)},[duration,playing])
  useEffect(()=>{if(elapsed>=duration)setPlaying(false)},[duration,elapsed])
  const visible = useMemo(()=>events.filter((event)=>event.elapsedMs<=elapsed),[elapsed,events])
  if(!token)return <main className="shell grid min-h-dvh place-items-center"><Link to="/" className="btn btn-primary no-underline">Sign in to review</Link></main>
  const title=bootstrap.data?.scenario.title??'After-action review'
  const csv=['elapsed_ms,occurred_at,workspace,actor_unit,actor_name,event_type,object_id',...events.map((event)=>[event.elapsedMs,event.occurredAt,event.workspace,event.actorUnit,JSON.stringify(event.actorName),event.eventType,event.objectId??''].join(','))].join('\n')
  return <main className="shell min-h-dvh"><header className="flex min-h-16 items-center gap-4 border-b border-[#34434c] bg-[#111a1f] px-4"><AppMark compact/><div className="flex-1"><h1 className="display">{title}</h1><p className="muted text-sm">After-action event timeline</p></div><button className="btn btn-secondary" onClick={()=>download(`session-${sessionId}.json`,JSON.stringify({session:bootstrap.data?.session,events},null,2),'application/json')}><Download size={18}/>JSON</button><button className="btn btn-secondary" onClick={()=>download(`session-${sessionId}.csv`,csv,'text/csv')}><Download size={18}/>CSV</button></header>
    <section className="mx-auto max-w-6xl p-4 md:p-6"><div className="panel p-4"><div className="flex items-center gap-3"><button className="btn btn-primary !w-12 !p-0" onClick={()=>setPlaying((value)=>!value)}>{playing?<Pause/>:<Play/>}</button><input aria-label="Playback time" className="w-full accent-[#327db7]" type="range" min={0} max={Math.max(1,duration)} step={250} value={elapsed} onChange={(event)=>setElapsed(Number(event.target.value))}/><output className="display min-w-24 text-right">{Math.floor(elapsed/60000)}:{String(Math.floor(elapsed/1000)%60).padStart(2,'0')}</output></div></div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]"><section className="panel min-h-96 p-4"><h2 className="display text-xl">Playback state</h2><p className="muted mt-2">{visible.length} of {events.length} recorded semantic changes replayed.</p><div className="mt-6 grid grid-cols-3 gap-px bg-[#34434c]"><div className="bg-[#111a1f] p-4"><span className="eyebrow">Objects added</span><b className="display mt-2 block text-3xl">{visible.filter((event)=>event.eventType==='object-added').length}</b></div><div className="bg-[#111a1f] p-4"><span className="eyebrow">Changes</span><b className="display mt-2 block text-3xl">{visible.filter((event)=>event.eventType==='object-updated').length}</b></div><div className="bg-[#111a1f] p-4"><span className="eyebrow">Injects</span><b className="display mt-2 block text-3xl">{visible.filter((event)=>event.eventType==='inject-revealed').length}</b></div></div></section><aside className="panel max-h-[65dvh] overflow-auto p-4"><h2 className="display text-xl">Timeline</h2><ol className="mt-3 space-y-2">{events.map((event)=><li key={event.id} className={`border-l-4 p-3 ${event.elapsedMs<=elapsed?'border-[#57a8df] bg-[#1d2a32]':'border-[#34434c] opacity-50'}`}><time className="eyebrow">+{Math.floor(event.elapsedMs/1000)}s</time><strong className="display mt-1 block text-sm">{event.eventType.replaceAll('-',' ')}</strong><span className="muted text-sm">{event.actorUnit} · {event.actorName}</span></li>)}</ol></aside></div>
    </section>
  </main>
}
