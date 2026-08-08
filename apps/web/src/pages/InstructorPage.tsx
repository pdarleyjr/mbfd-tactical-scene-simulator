import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { CheckCircle2, ClipboardCopy, Eye, Pause, Play, Radio, Users } from 'lucide-react'
import { AppMark } from '../components/AppMark'
import { StatusPill } from '../components/StatusPill'
import { SceneCanvas, type SceneCanvasHandle } from '../scene/SceneCanvas'
import { api } from '../api/client'
import { useAuthStore } from '../state/auth'
import { useBootstrap } from '../hooks/useBootstrap'
import { useWorkspace } from '../collaboration/useWorkspace'

export function InstructorPage() {
  const { sessionId } = useParams({ from: '/instructor/$sessionId' })
  const token = useAuthStore((state) => state.instructorToken)
  const bootstrap = useBootstrap(sessionId, token)
  const [workspace, setWorkspace] = useState<'operations' | '300-plan'>('operations')
  const [notice, setNotice] = useState('')
  const canvasRef = useRef<SceneCanvasHandle>(null)
  const operations = useWorkspace({ sessionId, workspace: 'operations', token: token ?? '', identity: {clientId:'instructor-controller',name:'Instructor',unit:'INSTRUCTOR',role:'instructor'}, enabled:Boolean(token) })
  const plan = useWorkspace({ sessionId, workspace: '300-plan', token: token ?? '', identity: {clientId:'instructor-controller',name:'Instructor',unit:'INSTRUCTOR',role:'instructor'}, enabled:Boolean(token) })
  const active = workspace === 'operations' ? operations : plan
  const scenario = bootstrap.data?.scenario
  const background = scenario?.assets.find((asset) => asset.kind === 'background')
  const actor = useMemo(() => ({ clientId: 'instructor-controller', name: 'Instructor', unit: 'INSTRUCTOR' }), [])
  if (!token) return <main className="shell grid min-h-dvh place-items-center"><div className="text-center"><h1 className="display text-3xl">Instructor sign-in required</h1><Link to="/" className="btn btn-primary mt-5 no-underline">Return home</Link></div></main>
  if (!bootstrap.data || !scenario) return <main className="shell grid min-h-dvh place-items-center"><p>{bootstrap.error?.message ?? 'Loading instructor console…'}</p></main>
  const session = bootstrap.data.session

  async function updateSession(body: Record<string, unknown>) { await api(`/api/sessions/${sessionId}`, { method:'PATCH', token, body }); await bootstrap.refetch() }
  async function join300() { const result = await api<{planPreserved:boolean}>(`/api/sessions/${sessionId}/300/join-operations`, {method:'POST',token}); await bootstrap.refetch(); setNotice(result.planPreserved ? '300 joined Operations. The private plan was preserved.' : '300 joined Operations.') }
  async function revealInject(index: number) { const inject = scenario?.injects[index]; if (!inject) return; await api(`/api/sessions/${sessionId}/instructor-events`, { method:'POST',token,body:{eventType:'inject-revealed',metadata:{index,title:inject.title,description:inject.description}}}); setNotice(`Inject released: ${inject.title}`) }
  async function presentationLink() { const result = await api<{token:string}>(`/api/sessions/${sessionId}/presentation-token`, {method:'POST',token}); const url = `${location.origin}/present/${sessionId}#token=${encodeURIComponent(result.token)}`; await navigator.clipboard.writeText(url); setNotice('Read-only presentation link copied. It expires in 24 hours.') }

  return <main className="shell min-h-dvh"><header className="flex min-h-16 items-center gap-3 border-b border-[#34434c] bg-[#111a1f] px-4"><AppMark compact/><div className="min-w-0 flex-1"><strong className="display block truncate">{scenario.title}</strong><span className="muted text-sm">Instructor · room code <b className="text-[#f4ecd9]">{session.code}</b></span></div><StatusPill status={active.status}/><Link to="/builder" className="btn btn-secondary no-underline">Scenarios</Link></header>
    <div className="grid min-h-[calc(100dvh-64px)] lg:grid-cols-[minmax(0,1fr)_350px]">
      <section className="relative min-h-[58dvh] bg-black"><div className="context-bar"><button className={`btn !min-h-10 ${workspace==='operations'?'btn-primary':'btn-secondary'}`} onClick={()=>setWorkspace('operations')}>Operations</button><button className={`btn !min-h-10 ${workspace==='300-plan'?'btn-primary':'btn-secondary'}`} onClick={()=>setWorkspace('300-plan')}>Private 300</button><button className="btn btn-secondary !min-h-10" onClick={()=>canvasRef.current?.fit()}>Fit map</button></div>{background && <SceneCanvas ref={canvasRef} backgroundUrl={background.runtimeUrl} world={{width:scenario.worldWidth,height:scenario.worldHeight}} objects={active.objects} staticObjects={scenario.staticObjects} actor={actor} mode="select" presence={active.presence} onSelect={()=>undefined} onUpsert={active.upsertObject} onRemove={active.removeObject} onCursor={active.setCursor}/>}</section>
      <aside className="space-y-4 border-l border-[#34434c] bg-[#111a1f] p-4"><section className="panel p-4"><h2 className="display flex items-center gap-2 text-xl"><Radio size={19}/>Session control</h2><div className="mt-3 grid grid-cols-2 gap-2"><button className="btn btn-primary" onClick={()=>void updateSession({status:'running'})}><Play size={17}/>Start</button><button className="btn btn-secondary" onClick={()=>void updateSession({status:'frozen'})}><Pause size={17}/>Freeze</button><button className="btn btn-secondary col-span-2" onClick={()=>void updateSession({status:'complete'})}><CheckCircle2 size={17}/>Complete</button></div><p className="muted mt-3 text-sm">Current: <b className="text-[#f4ecd9]">{session.status}</b> · 300: <b className="text-[#f4ecd9]">{session.mode300}</b></p>{session.mode300==='independent'&&<button className="btn btn-primary mt-3 w-full" onClick={()=>void join300()}>Join 300 to Operations</button>}</section>
        <section className="panel p-4"><h2 className="display flex items-center gap-2 text-xl"><Eye size={19}/>Presentation</h2><div className="mt-3 grid grid-cols-2 gap-2"><select className="field col-span-2" value={session.presentationMode} onChange={(event)=>void updateSession({presentationMode:event.target.value})}><option value="operations">Operations</option><option value="300-plan">300 plan</option><option value="split">Split view</option><option value="overlay">Overlay</option></select><button className="btn btn-secondary col-span-2" onClick={()=>void presentationLink()}><ClipboardCopy size={17}/>Copy display link</button></div></section>
        <section className="panel p-4"><h2 className="display flex items-center gap-2 text-xl"><Users size={19}/>Participants ({bootstrap.data.participants.length})</h2><ul className="mt-2 divide-y divide-[#34434c]">{bootstrap.data.participants.map((item)=><li key={item.clientId} className="flex min-h-12 items-center justify-between"><span>{item.name}</span><b className="display text-sm text-[#d9c8a5]">{item.unit}</b></li>)}</ul></section>
        <section className="panel p-4"><h2 className="display text-xl">Injects</h2><div className="mt-2 space-y-2">{scenario.injects.map((inject,index)=><button key={`${inject.title}-${index}`} className="w-full border border-[#53646e] bg-[#1d2a32] p-3 text-left" onClick={()=>void revealInject(index)}><strong className="display block text-sm">{inject.title}</strong><span className="muted text-sm">{inject.description}</span></button>)}</div></section>
        {notice&&<p className="border-l-4 border-[#45a179] bg-[#172c25] p-3" role="status">{notice}</p>}
      </aside>
    </div>
  </main>
}
