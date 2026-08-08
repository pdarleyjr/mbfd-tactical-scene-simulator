import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { AppMark } from '../components/AppMark'
import { StatusPill } from '../components/StatusPill'
import { SceneCanvas } from '../scene/SceneCanvas'
import { useBootstrap } from '../hooks/useBootstrap'
import { useWorkspace } from '../collaboration/useWorkspace'

function presentationToken(sessionId: string) {
  const key = `mbfd-presentation-${sessionId}`
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('token')
  if (fromHash) { sessionStorage.setItem(key, fromHash); history.replaceState(null, '', location.pathname + location.search); return fromHash }
  return sessionStorage.getItem(key) ?? ''
}

export function PresentationPage() {
  const { sessionId } = useParams({ from: '/present/$sessionId' })
  const [token] = useState(() => presentationToken(sessionId))
  const bootstrap = useBootstrap(sessionId, token)
  const operations = useWorkspace({sessionId,workspace:'operations',token,identity:{clientId:'display',name:'Classroom Display',unit:'DISPLAY',role:'presentation'},enabled:Boolean(token)})
  const plan = useWorkspace({sessionId,workspace:'300-plan',token,identity:{clientId:'display',name:'Classroom Display',unit:'DISPLAY',role:'presentation'},enabled:Boolean(token)})
  const refetchBootstrap = bootstrap.refetch
  useEffect(() => { const id = window.setInterval(() => void refetchBootstrap(), 2500); return () => clearInterval(id) }, [refetchBootstrap])
  const actor = useMemo(() => ({clientId:'display',name:'Classroom Display',unit:'DISPLAY'}), [])
  if (!token) return <main className="shell grid min-h-dvh place-items-center text-center"><div><h1 className="display text-4xl">Presentation link required</h1><p className="muted mt-3">Ask the instructor for a fresh read-only display link.</p><Link to="/" className="btn btn-secondary mt-5 no-underline">Home</Link></div></main>
  const scenario = bootstrap.data?.scenario
  const session = bootstrap.data?.session
  const background = scenario?.assets.find((asset)=>asset.kind==='background')
  if (!scenario || !session || !background) return <main className="shell grid min-h-dvh place-items-center"><p>{bootstrap.error?.message ?? 'Connecting display…'}</p></main>
  const canvas = (kind:'operations'|'300-plan') => <div className="relative h-full min-h-0"><div className="absolute left-4 top-4 z-20 bg-[#111a1f] px-3 py-2 display text-sm">{kind === 'operations' ? 'Operations' : '300 Plan'}</div><SceneCanvas backgroundUrl={background.runtimeUrl} world={{width:scenario.worldWidth,height:scenario.worldHeight}} objects={kind==='operations'?operations.objects:plan.objects} staticObjects={scenario.staticObjects} actor={actor} mode="select" readOnly presence={kind==='operations'?operations.presence:plan.presence} onSelect={()=>undefined} onUpsert={()=>undefined} onRemove={()=>undefined}/></div>
  const overlay = <div className="relative h-full min-h-0"><div className="absolute left-4 top-4 z-20 bg-[#111a1f] px-3 py-2 display text-sm">Operations + dashed 300 plan</div><SceneCanvas backgroundUrl={background.runtimeUrl} world={{width:scenario.worldWidth,height:scenario.worldHeight}} objects={operations.objects} comparisonObjects={plan.objects} staticObjects={scenario.staticObjects} actor={actor} mode="select" readOnly onSelect={()=>undefined} onUpsert={()=>undefined} onRemove={()=>undefined}/></div>
  return <main className="grid h-dvh grid-rows-[72px_minmax(0,1fr)] overflow-hidden bg-black"><header className="flex items-center gap-4 border-b border-[#34434c] bg-[#111a1f] px-5"><AppMark compact/><div className="min-w-0 flex-1"><h1 className="display truncate text-xl">{scenario.title}</h1><p className="muted text-sm">Room {session.code} · {session.status}</p></div><StatusPill status={operations.status}/><span className="eyebrow">Read-only display</span></header>
    <section className={session.presentationMode==='split'?'grid min-h-0 grid-cols-2 gap-px bg-[#d9c8a5]':'relative min-h-0'}>{session.presentationMode==='300-plan'?canvas('300-plan'):session.presentationMode==='operations'?canvas('operations'):session.presentationMode==='overlay'?overlay:<>{canvas('operations')}{canvas('300-plan')}</>}</section>
  </main>
}
