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
  const [timelinePage,setTimelinePage] = useState(0)
  useEffect(()=>{ if(token) void api<{items:DomainEvent[]}>(`/api/sessions/${sessionId}/events`,{token}).then((result)=>setEvents(result.items)) },[sessionId,token])
  const duration = events.at(-1)?.elapsedMs ?? 0
  useEffect(()=>{ if(!playing)return; const id=setInterval(()=>setElapsed((value)=>Math.min(duration,value+250)),250); return()=>clearInterval(id)},[duration,playing])
  useEffect(()=>{if(elapsed>=duration)setPlaying(false)},[duration,elapsed])
  const visible = useMemo(()=>events.filter((event)=>event.elapsedMs<=elapsed),[elapsed,events])
  const timelinePages = Math.max(1, Math.ceil(events.length / 5))
  const timelineEvents = events.slice(timelinePage * 5, timelinePage * 5 + 5)
  if(!token)return <main className="shell grid min-h-dvh place-items-center"><Link to="/" className="btn btn-primary no-underline">Sign in to review</Link></main>
  const title=bootstrap.data?.scenario.title??'After-action review'
  const csv=['elapsed_ms,occurred_at,workspace,actor_unit,actor_name,event_type,object_id',...events.map((event)=>[event.elapsedMs,event.occurredAt,event.workspace,event.actorUnit,JSON.stringify(event.actorName),event.eventType,event.objectId??''].join(','))].join('\n')
  return <main className="shell viewport-page review-page"><header className="app-header"><AppMark compact/><div className="min-w-0 flex-1"><h1 className="display truncate">{title}</h1><p className="muted text-sm">After-action event timeline</p></div><button className="btn btn-secondary" aria-label="Download JSON" onClick={()=>download(`session-${sessionId}.json`,JSON.stringify({session:bootstrap.data?.session,events},null,2),'application/json')}><Download size={18}/><span className="action-label">JSON</span></button><button className="btn btn-secondary" aria-label="Download CSV" onClick={()=>download(`session-${sessionId}.csv`,csv,'text/csv')}><Download size={18}/><span className="action-label">CSV</span></button></header>
    <section className="review-body"><div className="panel playback-controls"><button className="btn btn-primary !w-12 !p-0" onClick={()=>setPlaying((value)=>!value)}>{playing?<Pause/>:<Play/>}</button><input aria-label="Playback time" className="w-full accent-[#327db7]" type="range" min={0} max={Math.max(1,duration)} step={250} value={elapsed} onChange={(event)=>setElapsed(Number(event.target.value))}/><output className="display min-w-20 text-right">{Math.floor(elapsed/60000)}:{String(Math.floor(elapsed/1000)%60).padStart(2,'0')}</output></div>
      <div className="review-grid"><section className="panel playback-state"><h2 className="display text-xl">Playback state</h2><p className="muted">{visible.length} of {events.length} recorded semantic changes replayed.</p><div className="review-stats"><div><span className="eyebrow">Objects added</span><b className="display">{visible.filter((event)=>event.eventType==='object-added').length}</b></div><div><span className="eyebrow">Changes</span><b className="display">{visible.filter((event)=>event.eventType==='object-updated').length}</b></div><div><span className="eyebrow">Injects</span><b className="display">{visible.filter((event)=>event.eventType==='inject-revealed').length}</b></div></div></section><aside className="panel timeline-panel"><h2 className="display text-xl">Timeline</h2><ol>{timelineEvents.map((event)=><li key={event.id} className={event.elapsedMs<=elapsed?'replayed':''}><time className="eyebrow">+{Math.floor(event.elapsedMs/1000)}s</time><strong className="display">{event.eventType.replaceAll('-',' ')}</strong><span className="muted">{event.actorUnit} · {event.actorName}</span></li>)}</ol>{!events.length && <p className="muted">No events have been recorded.</p>}{timelinePages > 1 && <nav className="side-pager" aria-label="Timeline pages"><button className="btn btn-secondary" disabled={timelinePage===0} onClick={()=>setTimelinePage((page)=>page-1)}>Previous</button><output className="display">{timelinePage+1}/{timelinePages}</output><button className="btn btn-secondary" disabled={timelinePage>=timelinePages-1} onClick={()=>setTimelinePage((page)=>page+1)}>Next</button></nav>}</aside></div>
    </section>
  </main>
}
