import { useEffect, useMemo, useRef, useState } from 'react'
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

export function SessionPage() {
  const { sessionId } = useParams({ from: '/session/$sessionId' })
  const navigate = useNavigate()
  const canvasRef = useRef<SceneCanvasHandle>(null)
  const auth = useAuthStore()
  const clearParticipant = useAuthStore((state) => state.clearParticipant)
  const ui = useUiStore()
  const bootstrap = useBootstrap(sessionId, auth.token)
  const refetchBootstrap = bootstrap.refetch
  useEffect(() => { const id = window.setInterval(() => void refetchBootstrap(), 3000); return () => clearInterval(id) }, [refetchBootstrap])
  const [workspace, setWorkspace] = useState<'operations' | '300-plan'>(() => auth.role === 'command300' && auth.mode300 === 'independent' ? '300-plan' : 'operations')
  const effectiveWorkspace: Workspace = workspace
  const collaboration = useWorkspace({
    sessionId,
    workspace: effectiveWorkspace,
    token: auth.token ?? '',
    identity: { clientId: auth.clientId, name: auth.name ?? '', unit: auth.unit ?? '', role: auth.role ?? 'crew' },
    enabled: Boolean(auth.token),
  })
  const scenario = bootstrap.data?.scenario
  const selected = useMemo(() => collaboration.objects.find((object) => object.id === ui.selectedObjectId), [collaboration.objects, ui.selectedObjectId])
  const canDelete = Boolean(selected && (selected.createdByClientId === auth.clientId || selected.createdByUnit === auth.unit || auth.role === 'command300'))
  const background = scenario?.assets.find((asset) => asset.kind === 'background')
  const video = scenario?.assets.find((asset) => asset.kind === 'video')

  if (!auth.token) return <main className="shell grid min-h-dvh place-items-center p-5 text-center"><div><h1 className="display text-3xl">Session sign-in required</h1><p className="muted mt-3">Use the incident code to join this tactical scene.</p><Link to="/" className="btn btn-primary mt-5 no-underline">Enter incident code</Link></div></main>
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

  return <main className="incident-layout">
    <IncidentHeader title={scenario.title} code={bootstrap.data.session.code} unit={actor.unit} name={actor.name} status={collaboration.status} participantCount={bootstrap.data.participants.length} onVideo={() => ui.setVideoOpen(true)} onLeave={leave}/>
    <IncidentRail availableApparatus={scenario.apparatusTemplateIds} availableEvolutions={scenario.evolutionIds} placementTemplateId={ui.placementTemplateId} selectedEvolutionId={ui.selectedEvolutionId} hydrantActive={ui.canvasMode === 'hydrant'} disabled={Boolean(auth.permissions?.includes('read-only'))} onTemplateSelect={(id) => ui.setPlacementTemplate(id)} onEvolutionSelect={(id: EvolutionId) => ui.setEvolution(id)} onHydrant={() => ui.setCanvasMode('hydrant')} onTemplateDrop={(id, point) => { if (canvasRef.current?.placeTemplateAtClientPoint(id, point)) placementDone() }}/>
    <section className="incident-stage">
      <span className="sr-only" aria-live="polite" data-testid="object-count">{collaboration.objects.length} tactical objects</span>
      <ContextToolbar mode={ui.canvasMode} selected={Boolean(selected)} canDelete={canDelete} command300={auth.role === 'command300'} workspace={workspace} onMode={ui.setCanvasMode} onFit={() => canvasRef.current?.fit()} onDelete={() => { if (selected && canDelete) { collaboration.removeObject(selected); ui.selectObject(undefined) } }} onWorkspace={selectWorkspace}/>
      {background ? <SceneCanvas ref={canvasRef} backgroundUrl={background.runtimeUrl} world={{ width: scenario.worldWidth, height: scenario.worldHeight }} objects={collaboration.objects} staticObjects={scenario.staticObjects} actor={actor} mode={ui.canvasMode} placementTemplateId={ui.placementTemplateId} selectedEvolutionId={ui.selectedEvolutionId} selectedObjectId={ui.selectedObjectId} readOnly={auth.permissions?.includes('read-only')} presence={collaboration.presence} onSelect={ui.selectObject} onUpsert={collaboration.upsertObject} onRemove={collaboration.removeObject} onCursor={collaboration.setCursor} onPlacementComplete={placementDone}/> : <p className="grid h-full place-items-center">Scenario background unavailable.</p>}
      {auth.role === 'command300' && bootstrap.data.session.mode300 === 'independent' && <div className="session-toast">Independent 300 plan is private. Operations remains hidden until the instructor joins you.</div>}
    </section>
    <VideoViewer open={ui.videoOpen} onClose={() => ui.setVideoOpen(false)} source={video?.runtimeUrl} poster={video?.posterUrl}/>
  </main>
}
