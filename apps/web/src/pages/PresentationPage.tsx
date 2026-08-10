import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { AppMark } from '../components/AppMark'
import { StatusPill } from '../components/StatusPill'
import { SceneCanvas } from '../scene/SceneCanvas'
import { useBootstrap } from '../hooks/useBootstrap'
import { useWorkspace } from '../collaboration/useWorkspace'
import { ScenarioTimer } from '../components/ScenarioTimer'
import { api } from '../api/client'
import type { ActivityResponse } from '../api/types'
import { LiveActivityTable } from '../components/incident/LiveActivityTable'

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
  const [activity, setActivity] = useState<ActivityResponse>()
  const [activityError, setActivityError] = useState('')
  const refetchBootstrap = bootstrap.refetch
  useEffect(() => { const id = window.setInterval(() => void refetchBootstrap(), 2500); return () => clearInterval(id) }, [refetchBootstrap])
  useEffect(() => {
    if (!token) return
    const refresh = async () => {
      try { setActivity(await api<ActivityResponse>(`/api/sessions/${sessionId}/activity`, { token })); setActivityError('') }
      catch (error) { setActivityError(error instanceof Error ? error.message : 'Live activity is temporarily unavailable.') }
    }
    void refresh()
    const id = window.setInterval(() => void refresh(), 1000)
    return () => clearInterval(id)
  }, [sessionId, token])
  const actor = useMemo(() => ({clientId:'display',name:'Classroom Display',unit:'DISPLAY'}), [])
  if (!token) return <main className="shell grid min-h-dvh place-items-center text-center"><div><h1 className="display text-4xl">Presentation link required</h1><p className="muted mt-3">Ask the instructor for a fresh read-only display link.</p><Link to="/" className="btn btn-secondary mt-5 no-underline">Home</Link></div></main>
  const scenario = bootstrap.data?.scenario
  const session = bootstrap.data?.session
  const background = scenario?.assets.find((asset)=>asset.kind==='background')
  if (!scenario || !session || !background) return <main className="shell grid min-h-dvh place-items-center"><p>{bootstrap.error?.message ?? 'Connecting display…'}</p></main>
  const canvas = (kind:'operations'|'300-plan') => <div className="presentation-map-pane" key={kind}><div className="map-workspace-label">{kind === 'operations' ? 'Operations' : '300 Plan'}</div><SceneCanvas backgroundUrl={background.runtimeUrl} world={{width:scenario.worldWidth,height:scenario.worldHeight}} feetPerWorldUnit={scenario.feetPerWorldUnit} objects={kind==='operations'?operations.objects:plan.objects} staticObjects={scenario.staticObjects} actor={actor} mode="select" readOnly presence={kind==='operations'?operations.presence:plan.presence} onSelect={()=>undefined} onUpsert={()=>undefined} onRemove={()=>undefined}/></div>
  const overlay = <div className="presentation-map-pane"><div className="map-workspace-label">Operations + dashed 300 plan</div><SceneCanvas backgroundUrl={background.runtimeUrl} world={{width:scenario.worldWidth,height:scenario.worldHeight}} feetPerWorldUnit={scenario.feetPerWorldUnit} objects={operations.objects} comparisonObjects={plan.objects} staticObjects={scenario.staticObjects} actor={actor} mode="select" readOnly onSelect={()=>undefined} onUpsert={()=>undefined} onRemove={()=>undefined}/></div>
  return <main className="presentation-page"><header className="presentation-header"><AppMark compact/><div className="min-w-0 flex-1"><h1 className="display truncate text-xl">{scenario.title}</h1><p className="muted truncate text-sm">{bootstrap.data?.room?.name ?? 'Training room'} · {session.status}</p></div><ScenarioTimer compact elapsedMs={session.elapsedMs} status={session.status}/><StatusPill status={operations.status}/><span className="eyebrow presentation-readonly">Read-only display</span></header>
    <div className="presentation-body"><section className={`presentation-map-region ${session.presentationMode==='split'?'presentation-map-grid':''}`}>{session.presentationMode==='300-plan'?canvas('300-plan'):session.presentationMode==='operations'?canvas('operations'):session.presentationMode==='overlay'?overlay:<>{canvas('operations')}{canvas('300-plan')}</>}</section><aside className="presentation-activity"><LiveActivityTable activity={activity} loading={!activity && !activityError} error={activityError} autoCycle/></aside></div>
  </main>
}
