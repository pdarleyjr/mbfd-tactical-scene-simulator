import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import type { EvolutionId, Workspace } from '@mbfd/domain'
import { IncidentHeader } from '../components/incident/IncidentHeader'
import { IncidentRail } from '../components/incident/IncidentRail'
import { ContextToolbar } from '../components/incident/ContextToolbar'
import { VideoViewer } from '../components/incident/VideoViewer'
import { SceneCanvas, type SceneCanvasHandle } from '../scene/SceneCanvas'
import { useAuthStore } from '../state/auth'
import { useUiStore } from '../state/ui'
import { useBootstrap } from '../hooks/useBootstrap'
import { useWorkspace } from '../collaboration/useWorkspace'
import { api } from '../api/client'
import type { ActivityResponse } from '../api/types'
import { ActivityDialog } from '../components/incident/ActivityDialog'

export function SessionPage() {
  const { sessionId } = useParams({ from: '/session/$sessionId' })
  const navigate = useNavigate()
  const canvasRef = useRef<SceneCanvasHandle>(null)
  const auth = useAuthStore()
  const clearParticipant = useAuthStore((state) => state.clearParticipant)
  const ui = useUiStore()
  const bootstrap = useBootstrap(sessionId, auth.token)
  const [activity, setActivity] = useState<ActivityResponse>()
  const [activityOpen, setActivityOpen] = useState(false)
  const [taskNotice, setTaskNotice] = useState('')
  const refetchBootstrap = bootstrap.refetch
  useEffect(() => { const id = window.setInterval(() => void refetchBootstrap(), 3000); return () => clearInterval(id) }, [refetchBootstrap])
  const [workspace, setWorkspace] = useState<'operations' | '300-plan'>(() => auth.role === 'command300' && auth.mode300 === 'independent' ? '300-plan' : 'operations')
  const effectiveWorkspace: Workspace = workspace
  const sessionStatus = bootstrap.data?.session.status
  const unitStatus = bootstrap.data?.units.find((item) => item.unit === auth.unit)
  const canWork = sessionStatus === 'running' && unitStatus?.status === 'arrived'
  const canViewScene = canWork || sessionStatus === 'complete'
  const authenticationFailed = useCallback(() => { clearParticipant(); setTaskNotice('Your participant session expired. Choose the room and join again.') }, [clearParticipant])
  const collaboration = useWorkspace({
    sessionId,
    workspace: effectiveWorkspace,
    token: auth.token ?? '',
    identity: { clientId: auth.clientId, name: auth.name ?? '', unit: auth.unit ?? '', role: auth.role ?? 'crew' },
    enabled: Boolean(auth.token && canViewScene),
    onAuthenticationFailed: authenticationFailed,
  })
  const scenario = bootstrap.data?.scenario
  const selected = useMemo(() => collaboration.objects.find((object) => object.id === ui.selectedObjectId), [collaboration.objects, ui.selectedObjectId])
  const canDelete = Boolean(selected && (selected.createdByClientId === auth.clientId || selected.createdByUnit === auth.unit || auth.role === 'command300'))
  const background = scenario?.assets.find((asset) => asset.kind === 'background')
  const video = scenario?.assets.find((asset) => asset.kind === 'video')
  const activeEvolution = bootstrap.data?.evolutions.find((run) => run.unit === auth.unit && run.status === 'active')

  if (!auth.token) return <main className="shell grid min-h-dvh place-items-center p-5 text-center"><div><h1 className="display text-3xl">Participant setup required</h1><p className="muted mt-3">Choose your named training room and assignment.</p><Link to="/" className="btn btn-primary mt-5 no-underline">Choose a room</Link></div></main>
  if (bootstrap.error && !bootstrap.data) return <main className="shell grid min-h-dvh place-items-center p-5"><p role="alert">{bootstrap.error.message}</p></main>
  if (bootstrap.isLoading || !scenario || !bootstrap.data) return <main className="shell grid min-h-dvh place-items-center"><p className="display">Loading tactical scene…</p></main>

  const actor = { clientId: auth.clientId, name: auth.name ?? 'Participant', unit: auth.unit ?? 'UNKNOWN' }
  function placementDone() { ui.setPlacementTemplate(undefined); ui.setEvolution(undefined); ui.setCanvasMode('select') }
  function leave() { clearParticipant(); void navigate({ to: '/' }) }
  function selectWorkspace(next: 'operations' | '300-plan') {
    if (auth.role !== 'command300') return
    if (next === 'operations' && bootstrap.data?.session.mode300 === 'independent') return
    setWorkspace(next)
  }
  async function startEvolution(evolutionId: EvolutionId) {
    setTaskNotice('Starting evolution…')
    try {
      await api(`/api/sessions/${sessionId}/evolutions`, { method: 'POST', token: auth.token, body: { evolutionId } })
      const hoseMode = evolutionId === 'forward-lay' || evolutionId === 'reverse-lay' ? 'hose-supply5' : evolutionId === 'skid-load' ? 'hose-hose3' : 'hose-attack175'
      ui.setEvolution(undefined); ui.setCanvasMode(hoseMode)
      setTaskNotice('Evolution started. Draw the hose lay, then mark the evolution complete.')
      await refetchBootstrap()
    } catch (error) { setTaskNotice(error instanceof Error ? error.message : 'Evolution could not be started.') }
  }
  async function completeEvolution() {
    if (!activeEvolution) return
    setTaskNotice('Completing evolution…')
    try { await api(`/api/sessions/${sessionId}/evolutions/${activeEvolution.id}`, { method: 'PATCH', token: auth.token, body: { status: 'complete' } }); ui.setCanvasMode('select'); setTaskNotice(`${activeEvolution.label} complete. Waiting for the next assignment.`); await refetchBootstrap() } catch (error) { setTaskNotice(error instanceof Error ? error.message : 'Evolution could not be completed.') }
  }
  async function openActivity() { try { setActivity(await api<ActivityResponse>(`/api/sessions/${sessionId}/activity`, { token: auth.token })); setActivityOpen(true) } catch (error) { setTaskNotice(error instanceof Error ? error.message : 'Activity could not be loaded.') } }

  if (!canViewScene) {
    const waitingForStart = bootstrap.data.session.status === 'setup'
    const paused = bootstrap.data.session.status === 'frozen'
    return <main className="shell min-h-dvh"><header className="flex min-h-16 items-center gap-3 border-b border-[#34434c] bg-[#111a1f] px-4"><strong className="display flex-1 truncate">{bootstrap.data.room?.name ?? scenario.title}</strong><span className="display text-[#d9c8a5]">{actor.unit}</span><button className="btn btn-secondary" onClick={leave}>Leave</button></header><section className="grid min-h-[calc(100dvh-64px)] place-items-center overflow-hidden bg-[#090d10] p-5"><div className="max-w-xl border border-[#34434c] bg-[#111a1f] p-7 text-center shadow-2xl"><p className="eyebrow">{waitingForStart ? 'Room joined' : paused ? 'Scenario paused' : 'Unit staged'}</p><h1 className="display mt-3 text-3xl md:text-4xl">{waitingForStart ? 'Waiting for the instructor to start the scenario' : paused ? 'Stand by for the instructor' : 'Scenario will load once you make arrival'}</h1><p className="muted mt-4 leading-relaxed">{waitingForStart ? `You are assigned to ${actor.unit}. The scenario timer has not started.` : paused ? 'The tactical scene is temporarily frozen.' : `The instructor must mark ${actor.unit} arrived before your crew can begin.`}</p><div className="mt-5 inline-flex min-h-12 items-center border border-[#53646e] px-5"><span className="status-dot mr-3"/>Status updates automatically</div>{taskNotice && <p className="mt-4" role="status">{taskNotice}</p>}</div></section></main>
  }

  return <main className="incident-layout">
    <IncidentHeader title={scenario.title} roomName={bootstrap.data.room?.name ?? 'Training room'} unit={actor.unit} name={actor.name} status={collaboration.status} participantCount={bootstrap.data.participants.length} onVideo={() => ui.setVideoOpen(true)} onActivity={() => void openActivity()} onLeave={leave}/>
    <IncidentRail availableApparatus={scenario.apparatusTemplateIds} availableEvolutions={scenario.evolutionIds} placementTemplateId={ui.placementTemplateId} selectedEvolutionId={activeEvolution?.evolutionId as EvolutionId | undefined} hydrantActive={ui.canvasMode === 'hydrant'} disabled={!canWork || Boolean(auth.permissions?.includes('read-only'))} onTemplateSelect={(id) => ui.setPlacementTemplate(id)} onEvolutionSelect={(id: EvolutionId) => void startEvolution(id)} onHydrant={() => ui.setCanvasMode('hydrant')} onTemplateDrop={(id, point) => { if (canvasRef.current?.placeTemplateAtClientPoint(id, point)) placementDone() }}/>
    <section className="incident-stage">
      <span className="sr-only" aria-live="polite" data-testid="object-count">{collaboration.objects.length} tactical objects</span>
      <ContextToolbar mode={ui.canvasMode} selected={Boolean(selected)} canDelete={canDelete} hoseEnabled={Boolean(activeEvolution) && canWork} command300={auth.role === 'command300'} workspace={workspace} onMode={ui.setCanvasMode} onFit={() => canvasRef.current?.fit()} onDelete={() => { if (selected && canDelete) { collaboration.removeObject(selected); ui.selectObject(undefined) } }} onWorkspace={selectWorkspace}/>
      {background ? <SceneCanvas ref={canvasRef} backgroundUrl={background.runtimeUrl} world={{ width: scenario.worldWidth, height: scenario.worldHeight }} feetPerWorldUnit={scenario.feetPerWorldUnit} objects={collaboration.objects} staticObjects={scenario.staticObjects} actor={actor} mode={ui.canvasMode} placementTemplateId={ui.placementTemplateId} selectedObjectId={ui.selectedObjectId} readOnly={!canWork || auth.permissions?.includes('read-only')} presence={collaboration.presence} onSelect={ui.selectObject} onUpsert={collaboration.upsertObject} onRemove={collaboration.removeObject} onCursor={collaboration.setCursor} onPlacementComplete={placementDone}/> : <p className="grid h-full place-items-center">Scenario background unavailable.</p>}
      {auth.role === 'command300' && bootstrap.data.session.mode300 === 'independent' && <div className="session-toast">Independent 300 plan is private. Operations remains hidden until the instructor joins you.</div>}
      {taskNotice && !activeEvolution && <div className="session-toast" role="status">{taskNotice}</div>}
      {activeEvolution && <div className="absolute right-3 top-20 z-30 w-[min(92%,460px)] border border-[#d49c33] bg-[#111a1f] p-3 shadow-2xl"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 flex-1"><p className="eyebrow">Active evolution · {actor.unit}</p><strong className="display block text-lg">{activeEvolution.label}</strong><small className="muted">Started at {Math.floor(activeEvolution.startedElapsedMs / 60000).toString().padStart(2, '0')}:{Math.floor(activeEvolution.startedElapsedMs / 1000 % 60).toString().padStart(2, '0')}</small></div><button className="btn btn-primary" onClick={() => void completeEvolution()}>Mark complete</button></div>{taskNotice && <p className="mt-2 text-sm" role="status">{taskNotice}</p>}</div>}
    </section>
    <VideoViewer open={ui.videoOpen} onClose={() => ui.setVideoOpen(false)} source={video?.runtimeUrl} poster={video?.posterUrl}/>
    <ActivityDialog open={activityOpen} activity={activity} onClose={() => setActivityOpen(false)} title={bootstrap.data.session.status === 'complete' ? 'Final scenario results' : 'Unit activity'}/>
  </main>
}
