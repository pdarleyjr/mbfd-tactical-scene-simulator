import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crosshair } from 'lucide-react'
import { apparatusCatalog, apparatusModels, hoseCatalog, markerCatalog, type ApparatusTemplate, type EvolutionId, type HoseType } from '@mbfd/domain'
import { useBoard } from '../store/board'
import { canvasApi } from '../canvas/api'
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


const unitGroups: Array<{ title: string; kind: ApparatusTemplate['kind'] }> = [
  { title: 'Engines', kind: 'engine' },
  { title: 'Ladders', kind: 'aerial' },
  { title: 'Rescues', kind: 'rescue' },
]

function ApparatusTray() {
  const armed = useUi((state) => state.apparatusTemplate)
  const lastRotation = useUi((state) => state.lastRotation)
  const onScene = useBoard((state) => state.board.objects.filter((object) => object.type === 'apparatus').map((object) => object.type === 'apparatus' ? object.templateId : '').join(','))
  const placed = new Set(onScene.split(',').filter(Boolean))
  const facing = armed ? (lastRotation[armed] ?? 0) : 0
  const armedTemplate = apparatusCatalog.find((template) => template.id === armed)
  function setFacing(rotation: number) {
    const ui = useUi.getState()
    for (const template of apparatusCatalog) ui.rememberRotation(template.id, rotation)
  }
  return (
    <Tray
      title="Apparatus"
      hint={armedTemplate ? `Tap the map where ${armedTemplate.designation} goes.` : 'Tap a unit, then tap where it goes. Each unit goes on the scene once; tap a placed unit to select it.'}
      testId="apparatus-tray"
    >
      {unitGroups.map((group) => (
        <section key={group.kind} className="unit-group">
          <h3 className="tray__subhead">{group.title}</h3>
          <div className="unit-grid">
            {apparatusCatalog.filter((template) => template.kind === group.kind).map((template) => (
              <UnitCard key={template.id} template={template} armed={armed === template.id} placed={placed.has(template.id)} />
            ))}
          </div>
        </section>
      ))}
      <div className="tray__row">
        <span className="tray__label">Units face</span>
        <div className="facing" role="radiogroup" aria-label="Direction a newly placed unit faces">
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

/** Selects a unit that is already on the scene and brings it into view. */
function showPlaced(templateId: string) {
  const unit = useBoard.getState().board.objects.find((object) => object.type === 'apparatus' && object.templateId === templateId)
  if (!unit || unit.type !== 'apparatus') return
  const ui = useUi.getState()
  ui.setTool('select')
  ui.select([unit.id])
  canvasApi.current?.centerOn(unit)
}

function UnitCard({ template, armed, placed }: { template: ApparatusTemplate; armed: boolean; placed: boolean }) {
  const start = useRef<{ x: number; y: number; id: number } | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const model = apparatusModels[template.model]
  function activate() {
    if (placed) showPlaced(template.id)
    else useUi.getState().armApparatus(armed ? null : template.id)
  }
  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    start.current = { x: event.clientX, y: event.clientY, id: event.pointerId }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const origin = start.current
    if (!origin || origin.id !== event.pointerId || placed) return
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
    activate()
  }
  return (
    <>
      <button
        type="button"
        className={`unit-card ${armed ? 'is-armed' : ''} ${placed ? 'is-placed' : ''}`}
        aria-pressed={armed}
        aria-label={`${template.designation}, ${model.label}${placed ? ', on scene: select it' : armed ? ', ready to place' : ''}`}
        title={`${template.designation}: ${model.label}, ${formatFeetInches(model.lengthFt)}`}
        data-unit={template.id}
        data-placed={placed || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { start.current = null; setGhost(null) }}
        onClick={(event) => { if (event.detail === 0) activate() }}
      >
        <span className="unit-card__art"><img src={template.assetPath} alt="" draggable={false} /></span>
        <span className="unit-card__id">{template.id}</span>
        <span className="unit-card__kind">{placed ? 'On scene' : formatFeetInches(model.lengthFt)}</span>
      </button>
      {ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden>
          <img src={template.assetPath} alt="" />
        </div>
      )}
    </>
  )
}

function formatFeetInches(feet: number) {
  const whole = Math.floor(feet + 1e-6)
  const inches = Math.round((feet - whole) * 12)
  return inches ? `${whole}′ ${inches}″` : `${whole}′`
}

const plainLines: HoseType[] = ['attack175', 'hose3', 'supply5']

interface LineOption {
  id: EvolutionId
  title: string
  detail: (loads: { loadLengthFt: Record<string, number> }) => string
  nozzle?: boolean
}

const attackOptions: LineOption[] = [
  { id: 'jumpline', title: 'Preconnect / jumpline', detail: (loads) => `1¾″, ${loads.loadLengthFt.jumpline}′ (two 100′ sections)`, nozzle: true },
  { id: 'trashline', title: 'Trash line', detail: (loads) => `1¾″, 100′ + 50′ roll (${loads.loadLengthFt.trashline}′)`, nozzle: true },
  { id: 'high-rise-pack', title: 'High-rise pack', detail: (loads) => `1¾″, two 100′ packs (${loads.loadLengthFt['high-rise-pack']}′)`, nozzle: true },
]

const supplyOptions: LineOption[] = [
  { id: 'forward-lay', title: '5″ supply line', detail: (loads) => `Start at a hydrant (forward lay) or an engine (reverse lay). ${loads.loadLengthFt['forward-lay']}′ bed, 100′ sections` },
  { id: 'skid-load', title: '3″ line to gated wye', detail: (loads) => `50′ sections, ${loads.loadLengthFt['skid-load']}′ per side, then a 1¾″ attack line`, nozzle: true },
]

function HoseTray() {
  const choice = useUi((state) => state.hoseChoice)
  const loads = useBoard((state) => state.board.scenario.hoseLoads)
  const setChoice = useUi((state) => state.setHoseChoice)
  const selected = choice.kind === 'evolution' ? choice.evolutionId : null
  const nozzle = choice.kind === 'evolution' ? choice.nozzle : 'fog'
  const option = (item: LineOption) => (
    <button key={item.id} type="button" className={`evolution-option ${selected === item.id ? 'is-active' : ''}`} aria-pressed={selected === item.id} data-evolution={item.id} onClick={() => setChoice({ kind: 'evolution', evolutionId: item.id, nozzle })}>
      <span className="evolution-option__name">{item.title}</span>
      <span className="evolution-option__summary">{item.detail(loads)}</span>
    </button>
  )
  const needsNozzle = [...attackOptions, ...supplyOptions].find((item) => item.id === selected)?.nozzle
  return (
    <Tray title="Hose" hint="Tap the engine (or hydrant) the line starts from, tap along the route, then tap where it ends. Trucks do not move while you lay hose." testId="hose-tray">
      <h3 className="tray__subhead">Fire attack</h3>
      <div className="evolution-list">{attackOptions.map(option)}</div>
      <h3 className="tray__subhead">Water supply</h3>
      <div className="evolution-list">{supplyOptions.map(option)}</div>
      {needsNozzle && (
        <div className="tray__row">
          <span className="tray__label">Nozzle</span>
          <Segmented size="sm" label="Nozzle type" value={nozzle} options={[{ value: 'fog', label: 'Fog' }, { value: 'smooth-bore', label: 'Smooth bore' }]} onChange={(next) => setChoice({ ...choice, nozzle: next } as HoseChoice)} />
        </div>
      )}
      <h3 className="tray__subhead">Plain line (no packaged load)</h3>
      <div className="plain-lines">
        {plainLines.map((type) => {
          const definition = hoseCatalog[type]
          const active = choice.kind === 'free' && choice.hoseType === type
          return (
            <button key={type} type="button" className={`hose-option ${active ? 'is-active' : ''}`} aria-pressed={active} data-hose={type} onClick={() => setChoice({ kind: 'free', hoseType: type, purpose: definition.defaultPurpose })}>
              <span className="hose-option__swatch" style={{ background: definition.color, height: definition.width + 2 }} aria-hidden />
              <span className="hose-option__label">{definition.shortLabel}</span>
            </button>
          )
        })}
      </div>
    </Tray>
  )
}



function MarkerTray() {
  const markerType = useUi((state) => state.markerType)
  const setMarkerType = useUi((state) => state.setMarkerType)
  return (
    <Tray title="Markers" hint="Choose a marker, then tap the map. Flames and smoke can be resized from their edge." testId="marker-tray">
      <h3 className="tray__subhead">Fire and smoke</h3>
      <div className="marker-grid">
        {markerCatalog.filter((marker) => marker.effect).map((marker) => (
          <button key={marker.id} type="button" className={`marker-option ${markerType === marker.id ? 'is-active' : ''}`} aria-pressed={markerType === marker.id} onClick={() => setMarkerType(marker.id)} data-marker={marker.id}>
            <span className={`marker-option__badge marker-option__badge--${marker.effect}`} aria-hidden />
            <span>{marker.label}</span>
          </button>
        ))}
      </div>
      <h3 className="tray__subhead">Markers</h3>
      <div className="marker-grid">
        {markerCatalog.filter((marker) => !marker.effect).map((marker) => (
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
