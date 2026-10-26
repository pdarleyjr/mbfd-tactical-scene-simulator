import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair } from 'lucide-react'
import { apparatusCatalog, evolutionCatalog, hoseCatalog, markerCatalog, type ApparatusTemplate, type HoseType } from '@mbfd/domain'
import { useBoard } from '../store/board'
import { useUi, type HoseChoice } from '../store/ui'
import { Segmented } from './primitives'

/** Contextual options for the active tool, beside the dock. */
export function ToolTray() {
  const tool = useUi((state) => state.tool)
  const drawing = useUi((state) => Boolean(state.draft?.points.length))
  // Get out of the way once a line is being drawn; the draft bar takes over.
  if (drawing) return null
  if (tool === 'apparatus') return <ApparatusTray />
  if (tool === 'hose') return <HoseTray />
  if (tool === 'marker') return <MarkerTray />
  if (tool === 'arrow') return <ArrowTray />
  if (tool === 'measure' || tool === 'calibrate') return <MeasureTray />
  return null
}

function Tray({ title, hint, children, testId }: { title: string; hint?: string; children: ReactNode; testId?: string }) {
  return (
    <aside className="tray" aria-label={title} data-testid={testId}>
      <header className="tray__head">
        <h2>{title}</h2>
        {hint && <p>{hint}</p>}
      </header>
      {children}
    </aside>
  )
}

const facings = [
  { rotation: 0, label: 'Facing up', icon: <ArrowUp size={16} /> },
  { rotation: 90, label: 'Facing right', icon: <ArrowRight size={16} /> },
  { rotation: 180, label: 'Facing down', icon: <ArrowDown size={16} /> },
  { rotation: 270, label: 'Facing left', icon: <ArrowLeft size={16} /> },
]

function ApparatusTray() {
  const armed = useUi((state) => state.apparatusTemplate)
  const lastRotation = useUi((state) => state.lastRotation)
  const counts = useBoard((state) => {
    const tally: Record<string, number> = {}
    for (const object of state.board.objects) if (object.type === 'apparatus') tally[object.templateId] = (tally[object.templateId] ?? 0) + 1
    return JSON.stringify(tally)
  })
  const tally = JSON.parse(counts) as Record<string, number>
  const facing = armed ? (lastRotation[armed] ?? 0) : 0
  function setFacing(rotation: number) {
    const ui = useUi.getState()
    for (const template of apparatusCatalog) ui.rememberRotation(template.id, rotation)
  }
  return (
    <Tray title="Apparatus" hint={armed ? `Tap the map to place ${armed}. Keep tapping for more copies.` : 'Tap a unit, then tap the map. Or drag a unit onto the map.'} testId="apparatus-tray">
      <div className="unit-grid">
        {apparatusCatalog.map((template) => (
          <UnitCard key={template.id} template={template} armed={armed === template.id} count={tally[template.id] ?? 0} />
        ))}
      </div>
      <div className="tray__row">
        <span className="tray__label">New units face</span>
        <div className="facing" role="radiogroup" aria-label="Direction new units face">
          {facings.map((option) => (
            <button key={option.rotation} type="button" role="radio" aria-checked={Math.round(facing) === option.rotation} aria-label={option.label} title={option.label} className={Math.round(facing) === option.rotation ? 'is-active' : ''} onClick={() => setFacing(option.rotation)}>
              {option.icon}
            </button>
          ))}
        </div>
      </div>
    </Tray>
  )
}

function UnitCard({ template, armed, count }: { template: ApparatusTemplate; armed: boolean; count: number }) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const origin = start.current
    if (!origin || origin.id !== event.pointerId) return
    if (!ghost && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 8) return
    setGhost({ x: event.clientX, y: event.clientY })
  }
  function onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const origin = start.current
    start.current = null
    if (!origin) return
    if (ghost) {
      setGhost(null)
      document.querySelector('[data-testid="scene-canvas"]')?.dispatchEvent(new CustomEvent('apparatus-drop', { detail: { templateId: template.id, clientX: event.clientX, clientY: event.clientY } }))
      return
    }
    useUi.getState().armApparatus(armed ? null : template.id)
  }
  return (
    <>
      <button
        type="button"
        className={`unit-card ${armed ? 'is-armed' : ''}`}
        aria-pressed={armed}
        aria-label={`${template.designation}${armed ? ', ready to place' : ''}`}
        data-unit={template.id}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { start.current = null; setGhost(null) }}
        onClick={(event) => { if (event.detail === 0) useUi.getState().armApparatus(armed ? null : template.id) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && armed) {
            event.preventDefault()
            document.querySelector('[data-testid="scene-canvas"]')?.dispatchEvent(new CustomEvent('apparatus-drop-center', { detail: { templateId: template.id } }))
          }
        }}
      >
        <span className="unit-card__art"><img src={template.assetPath} alt="" draggable={false} /></span>
        <span className="unit-card__id">{template.id}</span>
        <span className="unit-card__kind">{template.kind === 'engine' ? 'Engine' : 'Ladder'}</span>
        {count > 0 && <span className="unit-card__count" aria-label={`${count} on scene`}>{count}</span>}
      </button>
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden>
          <img src={template.assetPath} alt="" />
        </div>
      )}
    </>
  )
}

const hoseOrder: HoseType[] = ['attack175', 'hose3', 'supply5']

function HoseTray() {
  const choice = useUi((state) => state.hoseChoice)
  const loads = useBoard((state) => state.board.scenario.hoseLoads)
  const calibrated = useBoard((state) => Boolean(state.board.scenario.calibration))
  const setChoice = useUi((state) => state.setHoseChoice)
  const evolution = choice.kind === 'evolution' ? choice.evolutionId : null
  const loadFor = (id: string) => id === 'skid-load' ? `${loads.loadLengthFt['skid-load']} + ${loads.loadLengthFt['skid-load-attack']} ft` : `${loads.loadLengthFt[id as keyof typeof loads.loadLengthFt]} ft`
  return (
    <Tray title="Hose" hint="Tap points along the route, or drag a finger along it. End on a port to connect." testId="hose-tray">
      <h3 className="tray__subhead">Lines</h3>
      <div className="hose-list">
        {hoseOrder.map((type) => {
          const definition = hoseCatalog[type]
          const active = choice.kind === 'free' && choice.hoseType === type
          return (
            <button key={type} type="button" className={`hose-option ${active ? 'is-active' : ''}`} aria-pressed={active} data-hose={type} onClick={() => setChoice({ kind: 'free', hoseType: type, purpose: choice.kind === 'free' && choice.hoseType === type ? choice.purpose : definition.defaultPurpose })}>
              <span className="hose-option__swatch" style={{ background: definition.color, height: definition.width + 2 }} aria-hidden />
              <span className="hose-option__label">{definition.label}</span>
            </button>
          )
        })}
      </div>
      {choice.kind === 'free' && choice.hoseType === 'hose3' && (
        <div className="tray__row">
          <span className="tray__label">Use as</span>
          <Segmented size="sm" label="3-inch line purpose" value={choice.purpose === 'attack' ? 'attack' : 'feeder'} options={[{ value: 'feeder', label: 'Feeder' }, { value: 'attack', label: 'Attack' }]} onChange={(purpose) => setChoice({ ...choice, purpose })} />
        </div>
      )}
      <h3 className="tray__subhead">Evolutions</h3>
      <div className="evolution-list">
        {evolutionCatalog.map((item) => {
          const active = evolution === item.id
          return (
            <button key={item.id} type="button" className={`evolution-option ${active ? 'is-active' : ''}`} aria-pressed={active} data-evolution={item.id} onClick={() => setChoice({ kind: 'evolution', evolutionId: item.id, nozzle: choice.kind === 'evolution' ? choice.nozzle : 'fog' })}>
              <span className="evolution-option__name">{item.label}<small>{loadFor(item.id)}</small></span>
              <span className="evolution-option__summary">{item.summary}</span>
            </button>
          )
        })}
      </div>
      {choice.kind === 'evolution' && ['jumpline', 'skid-load', 'high-rise-pack'].includes(choice.evolutionId) && (
        <div className="tray__row">
          <span className="tray__label">Nozzle</span>
          <Segmented size="sm" label="Nozzle type" value={choice.nozzle} options={[{ value: 'fog', label: 'Fog' }, { value: 'smooth-bore', label: 'Smooth bore' }]} onChange={(nozzle) => setChoice({ ...choice, nozzle } as HoseChoice)} />
        </div>
      )}
      <p className="tray__note">Load lengths are scenario settings carried over from V2{calibrated ? '' : '. Calibrate the map to compare routes against them'}.</p>
    </Tray>
  )
}

function MarkerTray() {
  const markerType = useUi((state) => state.markerType)
  const setMarkerType = useUi((state) => state.setMarkerType)
  return (
    <Tray title="Markers" hint="Choose a marker, then tap the map." testId="marker-tray">
      <div className="marker-grid">
        {markerCatalog.map((marker) => (
          <button key={marker.id} type="button" className={`marker-option ${markerType === marker.id ? 'is-active' : ''}`} aria-pressed={markerType === marker.id} onClick={() => setMarkerType(marker.id)} data-marker={marker.id}>
            <span className="marker-option__badge" style={{ background: marker.color, color: ['victim', 'division', 'ventilation', 'entry'].includes(marker.id) ? '#0b1013' : '#fff' }}>{marker.code}</span>
            <span>{marker.label}</span>
          </button>
        ))}
      </div>
    </Tray>
  )
}

function ArrowTray() {
  const color = useUi((state) => state.arrowColor)
  const setColor = useUi((state) => state.setArrowColor)
  const swatches = { white: '#f3f1ea', yellow: '#f6c633', red: '#ff4d3d', blue: '#5cb8ff' } as const
  return (
    <Tray title="Arrow" hint="Tap points for the path, then tap the last point again to finish. Use arrows for travel routes and attack direction." testId="arrow-tray">
      <div className="swatches" role="radiogroup" aria-label="Arrow color">
        {(Object.keys(swatches) as Array<keyof typeof swatches>).map((key) => (
          <button key={key} type="button" role="radio" aria-checked={color === key} aria-label={key} className={color === key ? 'is-active' : ''} style={{ background: swatches[key] }} onClick={() => setColor(key)} />
        ))}
      </div>
    </Tray>
  )
}

function MeasureTray() {
  const tool = useUi((state) => state.tool)
  const calibration = useBoard((state) => state.board.scenario.calibration)
  return (
    <Tray title={tool === 'calibrate' ? 'Calibrate map' : 'Measure'} hint={tool === 'calibrate' ? 'Tap both ends of something whose real length you know.' : 'Tap points to measure a route. Pin it to keep it on the map.'} testId="measure-tray">
      <div className={`calibration-card ${calibration ? 'is-ok' : 'is-warning'}`}>
        <strong>{calibration ? 'Map calibrated' : 'Map not calibrated'}</strong>
        <span>{calibration ? `Reference: ${calibration.distanceFt} ft${calibration.reference ? ` (${calibration.reference})` : ''}` : 'Distances show in map units (u) until you calibrate.'}</span>
      </div>
      <button type="button" className={`btn btn--${tool === 'calibrate' ? 'primary' : 'default'} btn--block`} onClick={() => useUi.getState().setTool(tool === 'calibrate' ? 'measure' : 'calibrate')} data-testid="calibrate-tool">
        <Crosshair size={17} />
        <span>{tool === 'calibrate' ? 'Back to measuring' : calibration ? 'Recalibrate' : 'Calibrate map'}</span>
      </button>
    </Tray>
  )
}
