import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { CheckCircle2, ClipboardCopy, ExternalLink, Eye, Pause, Play, Radio, TableProperties, Truck, Users } from 'lucide-react'
import { AppMark } from '../components/AppMark'
import { StatusPill } from '../components/StatusPill'
import { SceneCanvas, type SceneCanvasHandle } from '../scene/SceneCanvas'
import { api } from '../api/client'
import { useAuthStore } from '../state/auth'
import { useBootstrap } from '../hooks/useBootstrap'
import { useWorkspace } from '../collaboration/useWorkspace'
import { ActivityDialog } from '../components/incident/ActivityDialog'
import type { ActivityResponse } from '../api/types'
import { ScenarioTimer } from '../components/ScenarioTimer'

type InstructorTab = 'session' | 'units' | 'benchmarks' | 'display' | 'more'
const instructorTabs: Array<{ id: InstructorTab; label: string }> = [
  { id: 'session', label: 'Session' },
  { id: 'units', label: 'Units' },
  { id: 'benchmarks', label: 'Benchmarks' },
  { id: 'display', label: 'Display' },
  { id: 'more', label: 'More' },
]

function SidePager(props: { page: number; count: number; size: number; label: string; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(props.count / props.size))
  if (pages <= 1) return null
  return <nav className="side-pager" aria-label={`${props.label} pages`}><button className="btn btn-secondary" disabled={props.page === 0} onClick={() => props.onPage(props.page - 1)}>Previous</button><output className="display">{props.page + 1}/{pages}</output><button className="btn btn-secondary" disabled={props.page >= pages - 1} onClick={() => props.onPage(props.page + 1)}>Next</button></nav>
}

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
  const [sessionBusy, setSessionBusy] = useState(false)
  const [presentationUrl, setPresentationUrl] = useState('')
  const [panelTab, setPanelTab] = useState<InstructorTab>('session')
  const [unitPage, setUnitPage] = useState(0)
  const [benchmarkPage, setBenchmarkPage] = useState(0)
  const [morePage, setMorePage] = useState(0)
  const [moreSection, setMoreSection] = useState<'participants' | 'injects'>('participants')
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

  async function updateSession(body: Record<string, unknown>) { if (sessionBusy) return; setSessionBusy(true); try { await api(`/api/sessions/${sessionId}`, { method:'PATCH', token, body }); await bootstrap.refetch(); if (body.status) setNotice(`Scenario ${body.status === 'running' && session.status === 'frozen' ? 'resumed' : String(body.status)}.`); else setNotice('Presentation mode updated.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Session control could not be updated.') } finally { setSessionBusy(false) } }
  async function join300() { try { const result = await api<{planPreserved:boolean}>(`/api/sessions/${sessionId}/300/join-operations`, {method:'POST',token}); await bootstrap.refetch(); setNotice(result.planPreserved ? '300 joined Operations. The private plan was preserved.' : '300 joined Operations.') } catch (error) { setNotice(error instanceof Error ? error.message : '300 could not be joined to Operations.') } }
  async function revealInject(index: number) { const inject = scenario?.injects[index]; if (!inject) return; try { await api(`/api/sessions/${sessionId}/instructor-events`, { method:'POST',token,body:{eventType:'inject-revealed',metadata:{index,title:inject.title,description:inject.description}}}); setNotice(`Inject released: ${inject.title}`) } catch (error) { setNotice(error instanceof Error ? error.message : 'Inject could not be released.') } }
  async function copyPresentationUrl(url = presentationUrl) { if (!url) return; try { await navigator.clipboard.writeText(url); setNotice('Read-only presentation link copied. It expires in 24 hours.') } catch { setNotice('The display link is ready below. Select Copy or Open display.') } }
  async function presentationLink() { try { const result = await api<{token:string}>(`/api/sessions/${sessionId}/presentation-token`, {method:'POST',token}); const url = `${location.origin}/present/${sessionId}#token=${encodeURIComponent(result.token)}`; setPresentationUrl(url); await copyPresentationUrl(url) } catch (error) { setNotice(error instanceof Error ? error.message : 'Presentation link could not be generated.') } }
  async function setArrival(unit: string, status: 'staged' | 'arrived') { try { await api(`/api/sessions/${sessionId}/units/${encodeURIComponent(unit)}`, { method: 'PATCH', token, body: { status } }); await refreshLive(); setNotice(`${unit} marked ${status}.`) } catch (error) { setNotice(error instanceof Error ? error.message : `${unit} arrival could not be updated.`) } }
  async function setBenchmark(id: string, completed: boolean) { try { await api(`/api/sessions/${sessionId}/benchmarks/${id}`, { method: 'PATCH', token, body: { completed } }); await refreshLive(); setNotice(completed ? 'Benchmark timestamped.' : 'Benchmark reopened.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Benchmark could not be updated.') } }
  async function openActivity() { try { await refreshLive(); setActivityOpen(true) } catch (error) { setNotice(error instanceof Error ? error.message : 'Activity could not be loaded.') } }

  const visibleUnits = bootstrap.data.units.slice(unitPage * 4, unitPage * 4 + 4)
  const visibleBenchmarks = bootstrap.data.benchmarks.slice(benchmarkPage * 4, benchmarkPage * 4 + 4)
  const moreItems = moreSection === 'participants' ? bootstrap.data.participants : scenario.injects
  const visibleMore = moreItems.slice(morePage * 4, morePage * 4 + 4)

  return <main className="shell viewport-page"><header className="app-header"><AppMark compact/><div className="min-w-0 flex-1"><strong className="display block truncate">{scenario.title}</strong><span className="muted text-sm">Instructor · <b className="text-[#f4ecd9]">{bootstrap.data.room?.name ?? 'Training room'}</b></span></div><StatusPill status={active.status}/><Link to="/builder" className="btn btn-secondary no-underline">Setup</Link></header>
    <div className="instructor-workspace">
      <section className="instructor-map"><div className="context-bar instructor-map-tabs"><button className={`btn !min-h-10 ${workspace==='operations'?'btn-primary':'btn-secondary'}`} onClick={()=>setWorkspace('operations')}>Operations</button><button className={`btn !min-h-10 ${workspace==='300-plan'?'btn-primary':'btn-secondary'}`} onClick={()=>setWorkspace('300-plan')}>Private 300</button><button className="btn btn-secondary !min-h-10" onClick={()=>canvasRef.current?.fit()}>Fit map</button></div>{background ? <SceneCanvas ref={canvasRef} backgroundUrl={background.runtimeUrl} world={{width:scenario.worldWidth,height:scenario.worldHeight}} feetPerWorldUnit={scenario.feetPerWorldUnit} objects={active.objects} staticObjects={scenario.staticObjects} actor={actor} mode="select" selectedObjectId={selectedObjectId} presence={active.presence} onSelect={setSelectedObjectId} onUpsert={active.upsertObject} onRemove={active.removeObject} onCursor={active.setCursor}/> : <div className="empty-workspace">Map unavailable</div>}</section>
      <aside className="instructor-controls"><nav className="instructor-tabs" role="tablist" aria-label="Instructor controls">{instructorTabs.map((tab) => <button key={tab.id} role="tab" aria-selected={panelTab === tab.id} className="workspace-tab" onClick={() => setPanelTab(tab.id)}>{tab.label}</button>)}</nav><div className="instructor-panel-frame">
        {panelTab === 'session' && <section role="tabpanel" aria-label="Session" className="control-panel"><div className="control-heading"><h2 className="display flex items-center gap-2 text-xl"><Radio size={19}/>Session control</h2><ScenarioTimer compact elapsedMs={session.elapsedMs} status={session.status}/></div><div className="control-action-grid"><button className="btn btn-primary" disabled={sessionBusy || session.status === 'running' || session.status === 'complete'} onClick={()=>void updateSession({status:'running'})}><Play size={17}/>{session.status === 'frozen' ? 'Resume' : 'Start'}</button><button className="btn btn-secondary" disabled={sessionBusy || session.status !== 'running'} onClick={()=>void updateSession({status:'frozen'})}><Pause size={17}/>Freeze</button><button className="btn btn-secondary col-span-2" disabled={sessionBusy || session.status === 'setup' || session.status === 'complete'} onClick={()=>void updateSession({status:'complete'})}><CheckCircle2 size={17}/>Complete</button></div><p className="muted text-sm">Current: <b className="text-[#f4ecd9]">{session.status}</b> · 300: <b className="text-[#f4ecd9]">{session.mode300}</b></p>{session.mode300==='independent'&&<button className="btn btn-primary w-full" onClick={()=>void join300()}>Join 300 to Operations</button>}</section>}
        {panelTab === 'units' && <section role="tabpanel" aria-label="Units" className="control-panel"><div className="control-heading"><div><h2 className="display flex items-center gap-2 text-xl"><Truck size={19}/>Unit arrivals</h2><p className="muted text-sm">Start the scenario, then make each assigned unit arrive.</p></div><button className="btn btn-secondary !px-3" onClick={() => void openActivity()}><TableProperties size={17}/>Activity</button></div><div className="unit-grid">{visibleUnits.map((item) => <button key={item.unit} className={`btn ${item.status === 'arrived' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => void setArrival(item.unit, item.status === 'arrived' ? 'staged' : 'arrived')}><span className="display">{item.unit}</span><span className="text-xs">{item.status === 'arrived' ? 'Arrived' : 'Make arrival'}</span></button>)}</div><SidePager page={unitPage} count={bootstrap.data.units.length} size={4} label="Unit" onPage={setUnitPage}/></section>}
        {panelTab === 'benchmarks' && <section role="tabpanel" aria-label="Benchmarks" className="control-panel"><div className="control-heading"><div><h2 className="display text-xl">Benchmarks</h2><p className="muted text-sm">Tap when the crews achieve each milestone.</p></div><button className="btn btn-secondary !px-3" onClick={() => void openActivity()}><TableProperties size={17}/>Live table</button></div><div className="benchmark-control-list">{visibleBenchmarks.map((benchmark) => <button key={benchmark.id} className={`benchmark-control ${benchmark.completedAt ? 'complete' : ''}`} onClick={() => void setBenchmark(benchmark.id, !benchmark.completedAt)}><CheckCircle2 size={20}/><span><strong>{benchmark.label}</strong><small>{benchmark.completedElapsedMs === undefined ? benchmark.description : `Completed at ${Math.floor(benchmark.completedElapsedMs / 60000).toString().padStart(2, '0')}:${Math.floor(benchmark.completedElapsedMs / 1000 % 60).toString().padStart(2, '0')}`}</small></span></button>)}</div>{!bootstrap.data.benchmarks.length && <div className="empty-workspace">No benchmarks were selected during setup.</div>}<SidePager page={benchmarkPage} count={bootstrap.data.benchmarks.length} size={4} label="Benchmark" onPage={setBenchmarkPage}/></section>}
        {panelTab === 'display' && <section role="tabpanel" aria-label="Display" className="control-panel"><h2 className="display flex items-center gap-2 text-xl"><Eye size={19}/>Presentation</h2><p className="muted text-sm">The display always includes the live map and activity table.</p><label><span className="field-label">Map view</span><select aria-label="Display view" className="field" disabled={sessionBusy} value={session.presentationMode} onChange={(event)=>void updateSession({presentationMode:event.target.value})}><option value="operations">Operations</option><option value="300-plan">300 plan</option><option value="split">Split view</option><option value="overlay">Overlay</option></select></label><button className="btn btn-secondary w-full" onClick={()=>void presentationLink()}><ClipboardCopy size={17}/>Generate display link</button>{presentationUrl && <><label><span className="field-label">Presentation link</span><input aria-label="Presentation link" className="field text-xs" readOnly value={presentationUrl} onFocus={(event) => event.currentTarget.select()}/></label><div className="grid grid-cols-2 gap-2"><button className="btn btn-secondary" onClick={()=>void copyPresentationUrl()}><ClipboardCopy size={17}/>Copy</button><a className="btn btn-primary no-underline" href={presentationUrl} target="_blank" rel="noreferrer"><ExternalLink size={17}/>Open display</a></div></>}</section>}
        {panelTab === 'more' && <section role="tabpanel" aria-label="More" className="control-panel"><div className="segmented"><button className={moreSection==='participants'?'active':''} aria-pressed={moreSection==='participants'} onClick={()=>{setMoreSection('participants');setMorePage(0)}}><Users size={17}/>Participants</button><button className={moreSection==='injects'?'active':''} aria-pressed={moreSection==='injects'} onClick={()=>{setMoreSection('injects');setMorePage(0)}}>Injects</button></div>{moreSection === 'participants' ? <><h2 className="display text-lg">Connected members ({bootstrap.data.participants.length})</h2><ul className="compact-list">{(visibleMore as typeof bootstrap.data.participants).map((item)=><li key={item.clientId}><span className="truncate">{item.name}</span><b className="display">{item.unit}</b></li>)}</ul></> : <><h2 className="display text-lg">Reveal inject</h2><div className="inject-control-list">{(visibleMore as typeof scenario.injects).map((inject,index)=><button key={`${inject.title}-${morePage*4+index}`} onClick={()=>void revealInject(morePage*4+index)}><strong className="display">{inject.title}</strong><span className="muted">{inject.description}</span></button>)}</div></>} {!moreItems.length && <div className="empty-workspace">No {moreSection} are available.</div>}<SidePager page={morePage} count={moreItems.length} size={4} label={moreSection} onPage={setMorePage}/><button className="btn btn-secondary w-full" onClick={() => void openActivity()}><TableProperties size={17}/>Open live activity table</button></section>}
      </div></aside>
      {notice&&<p className="workspace-notice" role="status">{notice}</p>}
    </div>
    <ActivityDialog open={activityOpen} activity={activity} onClose={() => setActivityOpen(false)} title={session.status === 'complete' ? 'Final scenario results' : 'Live scenario activity'}/>
  </main>
}
