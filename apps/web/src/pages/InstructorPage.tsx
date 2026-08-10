import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { CheckCircle2, ClipboardCopy, Eye, Pause, Play, Radio, TableProperties, Truck, Users } from 'lucide-react'
import { AppMark } from '../components/AppMark'
import { StatusPill } from '../components/StatusPill'
import { SceneCanvas, type SceneCanvasHandle } from '../scene/SceneCanvas'
import { api } from '../api/client'
import { useAuthStore } from '../state/auth'
import { useBootstrap } from '../hooks/useBootstrap'
import { useWorkspace } from '../collaboration/useWorkspace'
import { ActivityDialog } from '../components/incident/ActivityDialog'
import type { ActivityResponse } from '../api/types'

export function InstructorPage() {
  const { sessionId } = useParams({ from: '/instructor/$sessionId' })
  const token = useAuthStore((state) => state.instructorToken)
  const clearInstructor = useAuthStore((state) => state.clearInstructor)
  const bootstrap = useBootstrap(sessionId, token)
  const refetchBootstrap = bootstrap.refetch
  const [workspace, setWorkspace] = useState<'operations' | '300-plan'>('operations')
  const [notice, setNotice] = useState('')
  const [activity, setActivity] = useState<ActivityResponse>()
  const [activityOpen, setActivityOpen] = useState(false)
  const [selectedObjectId, setSelectedObjectId] = useState<string>()
  const canvasRef = useRef<SceneCanvasHandle>(null)
  const authenticationFailed = useCallback(() => { clearInstructor(); setNotice('Your instructor session expired. Sign in again with PIN 2300.') }, [clearInstructor])
  const operations = useWorkspace({ sessionId, workspace: 'operations', token: token ?? '', identity: {clientId:'instructor-controller',name:'Instructor',unit:'INSTRUCTOR',role:'instructor'}, enabled:Boolean(token), onAuthenticationFailed: authenticationFailed })
  const plan = useWorkspace({ sessionId, workspace: '300-plan', token: token ?? '', identity: {clientId:'instructor-controller',name:'Instructor',unit:'INSTRUCTOR',role:'instructor'}, enabled:Boolean(token), onAuthenticationFailed: authenticationFailed })
  const active = workspace === 'operations' ? operations : plan
  const scenario = bootstrap.data?.scenario
  const background = scenario?.assets.find((asset) => asset.kind === 'background')
  const actor = useMemo(() => ({ clientId: 'instructor-controller', name: 'Instructor', unit: 'INSTRUCTOR' }), [])
  const refreshLive = useCallback(async () => {
    if (!token) return
    await refetchBootstrap()
    setActivity(await api<ActivityResponse>(`/api/sessions/${sessionId}/activity`, { token }))
  }, [refetchBootstrap, sessionId, token])
  useEffect(() => { void refreshLive().catch(() => undefined); const id = window.setInterval(() => void refreshLive().catch(() => undefined), 2000); return () => clearInterval(id) }, [refreshLive])
  if (!token) return <main className="shell grid min-h-dvh place-items-center"><div className="text-center"><h1 className="display text-3xl">Instructor sign-in required</h1><Link to="/" className="btn btn-primary mt-5 no-underline">Return home</Link></div></main>
  if (!bootstrap.data || !scenario) return <main className="shell grid min-h-dvh place-items-center"><p>{bootstrap.error?.message ?? 'Loading instructor console…'}</p></main>
  const session = bootstrap.data.session

  async function updateSession(body: Record<string, unknown>) { await api(`/api/sessions/${sessionId}`, { method:'PATCH', token, body }); await bootstrap.refetch() }
  async function join300() { const result = await api<{planPreserved:boolean}>(`/api/sessions/${sessionId}/300/join-operations`, {method:'POST',token}); await bootstrap.refetch(); setNotice(result.planPreserved ? '300 joined Operations. The private plan was preserved.' : '300 joined Operations.') }
  async function revealInject(index: number) { const inject = scenario?.injects[index]; if (!inject) return; await api(`/api/sessions/${sessionId}/instructor-events`, { method:'POST',token,body:{eventType:'inject-revealed',metadata:{index,title:inject.title,description:inject.description}}}); setNotice(`Inject released: ${inject.title}`) }
  async function presentationLink() { const result = await api<{token:string}>(`/api/sessions/${sessionId}/presentation-token`, {method:'POST',token}); const url = `${location.origin}/present/${sessionId}#token=${encodeURIComponent(result.token)}`; await navigator.clipboard.writeText(url); setNotice('Read-only presentation link copied. It expires in 24 hours.') }
  async function setArrival(unit: string, status: 'staged' | 'arrived') { await api(`/api/sessions/${sessionId}/units/${encodeURIComponent(unit)}`, { method: 'PATCH', token, body: { status } }); await refreshLive() }
  async function setBenchmark(id: string, completed: boolean) { await api(`/api/sessions/${sessionId}/benchmarks/${id}`, { method: 'PATCH', token, body: { completed } }); await refreshLive() }

  return <main className="shell min-h-dvh"><header className="flex min-h-16 items-center gap-3 border-b border-[#34434c] bg-[#111a1f] px-4"><AppMark compact/><div className="min-w-0 flex-1"><strong className="display block truncate">{scenario.title}</strong><span className="muted text-sm">Instructor · <b className="text-[#f4ecd9]">{bootstrap.data.room?.name ?? 'Training room'}</b></span></div><StatusPill status={active.status}/><Link to="/builder" className="btn btn-secondary no-underline">Setup</Link></header>
    <div className="grid min-h-[calc(100dvh-64px)] lg:grid-cols-[minmax(0,1fr)_350px]">
      <section className="relative min-h-[58dvh] bg-black"><div className="context-bar"><button className={`btn !min-h-10 ${workspace==='operations'?'btn-primary':'btn-secondary'}`} onClick={()=>setWorkspace('operations')}>Operations</button><button className={`btn !min-h-10 ${workspace==='300-plan'?'btn-primary':'btn-secondary'}`} onClick={()=>setWorkspace('300-plan')}>Private 300</button><button className="btn btn-secondary !min-h-10" onClick={()=>canvasRef.current?.fit()}>Fit map</button></div>{background && <SceneCanvas ref={canvasRef} backgroundUrl={background.runtimeUrl} world={{width:scenario.worldWidth,height:scenario.worldHeight}} feetPerWorldUnit={scenario.feetPerWorldUnit} objects={active.objects} staticObjects={scenario.staticObjects} actor={actor} mode="select" selectedObjectId={selectedObjectId} presence={active.presence} onSelect={setSelectedObjectId} onUpsert={active.upsertObject} onRemove={active.removeObject} onCursor={active.setCursor}/>}</section>
      <aside className="space-y-4 border-l border-[#34434c] bg-[#111a1f] p-4"><section className="panel p-4"><h2 className="display flex items-center gap-2 text-xl"><Radio size={19}/>Session control</h2><div className="mt-3 grid grid-cols-2 gap-2"><button className="btn btn-primary" onClick={()=>void updateSession({status:'running'})}><Play size={17}/>Start</button><button className="btn btn-secondary" onClick={()=>void updateSession({status:'frozen'})}><Pause size={17}/>Freeze</button><button className="btn btn-secondary col-span-2" onClick={()=>void updateSession({status:'complete'})}><CheckCircle2 size={17}/>Complete</button></div><p className="muted mt-3 text-sm">Current: <b className="text-[#f4ecd9]">{session.status}</b> · 300: <b className="text-[#f4ecd9]">{session.mode300}</b></p>{session.mode300==='independent'&&<button className="btn btn-primary mt-3 w-full" onClick={()=>void join300()}>Join 300 to Operations</button>}</section>
        <section className="panel p-4"><div className="flex items-center justify-between gap-2"><h2 className="display flex items-center gap-2 text-xl"><Truck size={19}/>Unit arrivals</h2><button className="btn btn-secondary !min-h-10 !px-3" onClick={() => void refreshLive().then(() => setActivityOpen(true))}><TableProperties size={17}/>Activity</button></div><p className="muted mt-2 text-sm">Participants remain blocked until the scenario is started and their assigned unit arrives.</p><div className="mt-3 grid grid-cols-2 gap-2">{bootstrap.data.units.map((item) => <button key={item.unit} className={`btn ${item.status === 'arrived' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => void setArrival(item.unit, item.status === 'arrived' ? 'staged' : 'arrived')}><span className="display">{item.unit}</span><span className="text-xs">{item.status === 'arrived' ? 'Arrived' : 'Make arrival'}</span></button>)}</div></section>
        <section className="panel p-4"><h2 className="display text-xl">Benchmarks</h2><p className="muted mt-1 text-sm">Tap a benchmark at the moment the crews achieve it.</p><div className="mt-3 space-y-2">{bootstrap.data.benchmarks.map((benchmark) => <button key={benchmark.id} className={`flex min-h-14 w-full items-center gap-3 border p-3 text-left ${benchmark.completedAt ? 'border-[#45a179] bg-[#172c25]' : 'border-[#53646e] bg-[#1d2a32]'}`} onClick={() => void setBenchmark(benchmark.id, !benchmark.completedAt)}><CheckCircle2 size={20} className={benchmark.completedAt ? 'text-[#45a179]' : 'text-[#9aabb4]'}/><span><strong className="block">{benchmark.label}</strong><small className="muted">{benchmark.completedElapsedMs === undefined ? benchmark.description : `Completed at ${Math.floor(benchmark.completedElapsedMs / 60000).toString().padStart(2, '0')}:${Math.floor(benchmark.completedElapsedMs / 1000 % 60).toString().padStart(2, '0')}`}</small></span></button>)}</div>{!bootstrap.data.benchmarks.length && <p className="muted mt-3">No benchmarks were selected during setup.</p>}</section>
        <section className="panel p-4"><h2 className="display flex items-center gap-2 text-xl"><Eye size={19}/>Presentation</h2><div className="mt-3 grid grid-cols-2 gap-2"><select className="field col-span-2" value={session.presentationMode} onChange={(event)=>void updateSession({presentationMode:event.target.value})}><option value="operations">Operations</option><option value="300-plan">300 plan</option><option value="split">Split view</option><option value="overlay">Overlay</option></select><button className="btn btn-secondary col-span-2" onClick={()=>void presentationLink()}><ClipboardCopy size={17}/>Copy display link</button></div></section>
        <section className="panel p-4"><h2 className="display flex items-center gap-2 text-xl"><Users size={19}/>Participants ({bootstrap.data.participants.length})</h2><ul className="mt-2 divide-y divide-[#34434c]">{bootstrap.data.participants.map((item)=><li key={item.clientId} className="flex min-h-12 items-center justify-between"><span>{item.name}</span><b className="display text-sm text-[#d9c8a5]">{item.unit}</b></li>)}</ul></section>
        <section className="panel p-4"><h2 className="display text-xl">Injects</h2><div className="mt-2 space-y-2">{scenario.injects.map((inject,index)=><button key={`${inject.title}-${index}`} className="w-full border border-[#53646e] bg-[#1d2a32] p-3 text-left" onClick={()=>void revealInject(index)}><strong className="display block text-sm">{inject.title}</strong><span className="muted text-sm">{inject.description}</span></button>)}</div></section>
        {notice&&<p className="border-l-4 border-[#45a179] bg-[#172c25] p-3" role="status">{notice}</p>}
      </aside>
    </div>
    <ActivityDialog open={activityOpen} activity={activity} onClose={() => setActivityOpen(false)} title={session.status === 'complete' ? 'Final scenario results' : 'Live scenario activity'}/>
  </main>
}
