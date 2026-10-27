import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUp, ArrowUpToLine, Copy, Lock, LockOpen, RotateCcw, RotateCw, Spline, Trash2, Unlink, X } from 'lucide-react'
import {
  apparatusModels,
  findApparatusTemplate,
  hoseCatalog,
  markerCatalog,
  type ApparatusObject,
  type ApplianceObject,
  type ArrowObject,
  type HoseObject,
  type HoseType,
  type HydrantObject,
  type MarkerObject,
  type MeasurementObject,
  type NoteObject,
  type NozzleObject,
  type SceneObject,
} from '@mbfd/domain'
import { apparatusModelFor, apparatusSize, defaultMarkerRadius, describeHose, objectName, polylineLength, portsFor, readHose, readLength, type WaterSupplyReport } from '@mbfd/fire-model'
import { sceneContext, useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { useWaterSupply } from '../store/selectors'
import { deleteSelection, disconnectHoseEnd, duplicateSelection, nudgeObject, reorderSelection, setRotation, startEvolutionFrom, toggleLockSelection, updateObject } from '../lib/commands'
import { extendHose } from '../canvas/drafting'
import { Button, CommitText, Field, IconButton, Section, Segmented } from './primitives'

const assignments = ['Fire attack', 'Water supply', 'Primary search', 'Ventilation', 'RIT', 'Exposure protection', 'Backup line', 'Staging', 'Command']

export function Inspector() {
  const selection = useUi((state) => state.selection)
  const objects = useBoard((state) => state.board.objects)
  const supply = useWaterSupply()
  const selected =useMemo(() => objects.filter((object) => selection.includes(object.id)), [objects, selection])
  if (!selected.length) return null
  if (selected.length > 1) return <MultiInspector objects={selected} />
  const object = selected[0]!
  const body = (() => {
    switch (object.type) {
      case 'apparatus': return <ApparatusInspector object={object} supply={supply} />
      case 'hose': return <HoseInspector object={object} supply={supply} />
      case 'hydrant': return <HydrantInspector object={object} supply={supply} />
      case 'appliance': return <WyeInspector object={object} />
      case 'nozzle': return <NozzleInspector object={object} />
      case 'marker': return <MarkerInspector object={object} />
      case 'note': return <NoteInspector object={object} />
      case 'arrow': return <ArrowInspector object={object} />
      case 'measurement': return <MeasurementInspector object={object} />
    }
  })()
  return (
    <div className="inspector" data-testid="inspector" data-type={object.type}>
      {body}
      <CommonActions object={object} />
    </div>
  )
}

function Header({ title, subtitle, art }: { title: ReactNode; subtitle?: ReactNode; art?: ReactNode }) {
  return (
    <header className="inspector__head">
      {art}
      <div className="inspector__titles">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <IconButton label="Close inspector" onClick={() => useUi.getState().select([])}><X size={18} /></IconButton>
    </header>
  )
}

function CommonActions({ object }: { object: SceneObject }) {
  return (
    <div className="inspector__actions">
      <Button icon={<Copy size={17} />} onClick={() => duplicateSelection()} title="Duplicate (Ctrl+D)">Duplicate</Button>
      <Button icon={object.locked ? <LockOpen size={17} /> : <Lock size={17} />} onClick={toggleLockSelection} title="Lock in place (L)">{object.locked ? 'Unlock' : 'Lock'}</Button>
      <IconButton label="Bring to front" onClick={() => reorderSelection('front')}><ArrowUpToLine size={18} /></IconButton>
      <IconButton label="Send to back" onClick={() => reorderSelection('back')}><ArrowDownToLine size={18} /></IconButton>
      <Button tone="danger" icon={<Trash2 size={17} />} onClick={deleteSelection} title="Delete (Del)" data-testid="delete-selection">Delete</Button>
    </div>
  )
}

function RotationControl({ object }: { object: ApparatusObject | ApplianceObject | NozzleObject | MarkerObject }) {
  const rotation = Math.round(object.rotation)
  return (
    <Field label="Rotation" hint="Or drag the round handle on the map (snaps every 15°; hold Shift for free).">
      {(id) => (
        <div className="rotation">
          <IconButton label="Rotate 15° left" onClick={() => setRotation(object.id, object.rotation - 15)}><RotateCcw size={17} /></IconButton>
          <button type="button" className="btn btn--quiet btn--step" aria-label="Rotate 1° left" onClick={() => setRotation(object.id, object.rotation - 1)}>−1°</button>
          <input id={id} className="input input--number" type="number" inputMode="numeric" min={0} max={359} value={rotation} onChange={(event) => setRotation(object.id, Number(event.target.value) || 0)} aria-label="Rotation in degrees" />
          <button type="button" className="btn btn--quiet btn--step" aria-label="Rotate 1° right" onClick={() => setRotation(object.id, object.rotation + 1)}>+1°</button>
          <IconButton label="Rotate 15° right" onClick={() => setRotation(object.id, object.rotation + 15)}><RotateCw size={17} /></IconButton>
        </div>
      )}
    </Field>
  )
}

/** Fine positioning without dragging: moves along the map or along the vehicle. */
function PositionPad({ object, unitsPerFt }: { object: ApparatusObject; unitsPerFt: number }) {
  const [stepFt, setStepFt] = useState(1)
  const step = stepFt * unitsPerFt
  const along = (direction: 1 | -1) => {
    const radians = object.rotation * Math.PI / 180
    nudgeObject(object.id, Math.sin(radians) * step * direction, -Math.cos(radians) * step * direction)
  }
  return (
    <Field label="Position" hint="Drag the unit on the map, or nudge it here. Arrow keys also nudge (Shift for 10×).">
      {() => (
        <div className="position-pad">
          <div className="position-pad__grid">
            <span />
            <IconButton label={`Move up ${stepFt} ft`} onClick={() => nudgeObject(object.id, 0, -step)}><ArrowUp size={18} /></IconButton>
            <span />
            <IconButton label={`Move left ${stepFt} ft`} onClick={() => nudgeObject(object.id, -step, 0)}><ArrowLeft size={18} /></IconButton>
            <span className="position-pad__dot" aria-hidden />
            <IconButton label={`Move right ${stepFt} ft`} onClick={() => nudgeObject(object.id, step, 0)}><ArrowRight size={18} /></IconButton>
            <span />
            <IconButton label={`Move down ${stepFt} ft`} onClick={() => nudgeObject(object.id, 0, step)}><ArrowDown size={18} /></IconButton>
            <span />
          </div>
          <div className="position-pad__side">
            <Button onClick={() => along(1)}>Pull forward</Button>
            <Button onClick={() => along(-1)}>Back up</Button>
            <Segmented size="sm" label="Nudge distance" value={String(stepFt)} options={[{ value: '1', label: '1 ft' }, { value: '5', label: '5 ft' }]} onChange={(value) => setStepFt(Number(value))} />
          </div>
        </div>
      )}
    </Field>
  )
}

function ApparatusInspector({ object, supply }: { object: ApparatusObject; supply: WaterSupplyReport }) {
  const template = findApparatusTemplate(object.templateId)
  const scenario = useBoard((state) => state.board.scenario)
  const objects = useBoard((state) => state.board.objects)
  const index = useMemo(() => new Map(objects.map((candidate) => [candidate.id, candidate])), [objects])
  const size = apparatusSize(object.templateId, sceneContext(scenario), object.modelId)
  const model = apparatusModelFor(object.templateId, object.modelId)
  const unit = supply.apparatus.get(object.id)
  const ports = portsFor(object, sceneContext(scenario))
  const hoses = objects.filter((candidate): candidate is HoseObject => candidate.type === 'hose')
  const lineAt = (portId: string) => hoses.find((hose) => (hose.from?.objectId === object.id && hose.from.portId === portId) || (hose.to?.objectId === object.id && hose.to.portId === portId))
  const freePreconnect = ['discharge-1.5', 'discharge-1.5b'].find((portId) => ports.some((port) => port.id === portId) && !lineAt(portId))
  const supplyText = unit?.supplied
    ? `Supplied from ${unit.hydrantIds.map((id) => objectName(index.get(id))).join(', ')}`
    : unit?.outputLineIds.length ? 'Flowing tank water only' : 'No lines in service'
  const modelOptions = template?.kind === 'rescue' ? (['horton-rescue'] as const) : template?.kind === 'engine' ? (['pierce-puc'] as const) : (['pierce-ascendant', 'pierce-arrow-xt', 'pierce-dash-2000'] as const)
  return (
    <>
      <Header
        art={<img className="inspector__art" src={template?.assetPath} alt="" />}
        title={<CommitText className="input input--title" value={object.label} maxLength={24} required aria-label="Unit label" data-testid="unit-label" onCommit={(label) => updateObject<ApparatusObject>(object.id, { label }, 'Rename unit')} />}
        subtitle={`${template?.designation ?? object.templateId} · ${model.label} · ${Math.round(model.lengthFt * 10) / 10} ft`}
      />
      <PositionPad object={object} unitsPerFt={size.unitsPerFt} />
      <RotationControl object={object} />
      <Field label="Assignment" hint="Shown under the unit on the map.">
        {(id) => (
          <>
            <CommitText id={id} list="assignment-options" value={object.assignment} maxLength={60} placeholder="e.g. Fire attack" onCommit={(assignment) => updateObject<ApparatusObject>(object.id, { assignment }, 'Set assignment')} />
            <datalist id="assignment-options">{assignments.map((item) => <option key={item} value={item} />)}</datalist>
          </>
        )}
      </Field>
      {modelOptions.length > 1 && (
        <Field label="Apparatus model" hint="Sets the length and intake position drawn on the map.">
          {(id) => (
            <select id={id} className="input" value={model.id} onChange={(event) => updateObject<ApparatusObject>(object.id, { modelId: event.target.value as ApparatusObject['modelId'] }, 'Change apparatus model')} data-testid="apparatus-model">
              {modelOptions.map((option) => <option key={option} value={option}>{apparatusModels[option].label} ({Math.round(apparatusModels[option].lengthFt * 10) / 10} ft)</option>)}
            </select>
          )}
        </Field>
      )}
      <Section title="Water">
        {!model.pump && <p className="status-line status-line--muted">No pump. Hose is pulled from engines and ladders.</p>}
        {model.pump && <p className={`status-line status-line--${unit?.supplied ? 'ok' : unit?.outputLineIds.length ? 'info' : 'muted'}`} data-testid="apparatus-supply">{supplyText}</p>}
        {ports.length > 0 && (
          <ul className="port-list">
            {ports.map((port) => {
              const line = lineAt(port.id)
              return (
                <li key={port.id}>
                  <span className="port-list__name">{port.label}</span>
                  <span className="port-list__state">{line ? describeHose(line, index) : 'Open'}</span>
                </li>
              )
            })}
          </ul>
        )}
        {model.pump && (
          <div className="quick-actions">
            {freePreconnect && <Button onClick={() => startEvolutionFrom('jumpline', object.id, freePreconnect)}>Pull preconnect</Button>}
            {freePreconnect && template?.kind === 'engine' && <Button onClick={() => startEvolutionFrom('trashline', object.id, freePreconnect)}>Pull trash line</Button>}
            {!lineAt('intake') && <Button onClick={() => startEvolutionFrom('reverse-lay', object.id, 'intake')}>Reverse lay to hydrant</Button>}
            {!lineAt('discharge-2.5') && <Button onClick={() => startEvolutionFrom('skid-load', object.id, 'discharge-2.5')}>3″ to gated wye</Button>}
          </div>
        )}
        {model.pump && <p className="fine-print">5″ intake on the driver's side, {model.intakeFromFrontFt} ft from the front bumper. Discharge locations are drawn at the pump panel.</p>}
      </Section>
      <p className="fine-print">{size.toScale ? `Drawn to scale: ${Math.round(model.lengthFt * 10) / 10} ft long on the calibrated map.` : 'Map not calibrated, so the unit is drawn at an approximate size. Calibrate to draw it to scale.'}</p>
    </>
  )
}


const hoseTypes: Array<{ value: HoseType; label: string }> = [
  { value: 'attack175', label: '1¾″' },
  { value: 'hose3', label: '3″' },
  { value: 'supply5', label: '5″' },
]

function HoseInspector({ object, supply }: { object: HoseObject; supply: WaterSupplyReport }) {
  const scenario = useBoard((state) => state.board.scenario)
  const objects = useBoard((state) => state.board.objects)
  const index = useMemo(() => new Map(objects.map((candidate) => [candidate.id, candidate])), [objects])
  const reading = readHose(object, scenario.hoseLoads, scenario.calibration)
  const definition = hoseCatalog[object.hoseType]
  const state = supply.lines.get(object.id) ?? 'dry'
  const issues = supply.issues.filter((issue) => issue.objectId === object.id)
  const loadRatio = reading.loadFt && reading.length.feet !== undefined ? Math.min(1.25, reading.length.feet / reading.loadFt) : undefined
  return (
    <>
      <Header
        art={<span className="inspector__swatch" style={{ background: definition.color }} />}
        title={definition.label}
        subtitle={`${object.evolution ? `${object.evolution.replace('-', ' ')} · ` : ''}${object.layDirection ? `${object.layDirection} lay · ` : ''}${state === 'hydrant' ? 'hydrant water' : state === 'tank' ? 'tank water' : 'no water source'}`}
      />
      <div className="readout" data-testid="hose-readout">
        <div className="readout__main">
          <strong>{reading.length.calibrated ? Math.round(reading.length.feet!) : Math.round(reading.length.world)}</strong>
          <span>{reading.length.calibrated ? 'ft route' : 'map units'}</span>
        </div>
        {reading.sections !== undefined && <div className="readout__side"><strong>{reading.sections}</strong><span>sections of {reading.sectionLengthFt} ft</span></div>}
      </div>
      {!reading.length.calibrated && <p className="status-line status-line--warning">Uncalibrated. Calibrate the map to read this line in feet.</p>}
      {loadRatio !== undefined && (
        <div className={`load-bar ${reading.overLoadFt ? 'is-over' : ''}`} aria-label={`Route uses ${Math.round(loadRatio * 100)}% of the ${reading.loadFt} ft load`}>
          <div className="load-bar__fill" style={{ width: `${Math.min(100, loadRatio * 100)}%` }} />
          <span>{reading.overLoadFt ? `${Math.round(reading.overLoadFt)} ft over the ${reading.loadFt} ft load` : `${Math.round(reading.length.feet!)} of ${reading.loadFt} ft load`}</span>
        </div>
      )}
      <Field label="Hose">
        {() => <Segmented label="Hose size" value={object.hoseType} options={hoseTypes} onChange={(hoseType) => updateObject<HoseObject>(object.id, { hoseType, purpose: hoseType === 'supply5' ? 'supply' : hoseType === 'attack175' ? 'attack' : object.purpose === 'supply' ? 'feeder' : object.purpose }, 'Change hose size')} />}
      </Field>
      {object.hoseType === 'hose3' && (
        <Field label="Use">
          {() => <Segmented label="Line purpose" value={object.purpose === 'attack' ? 'attack' : 'feeder'} options={[{ value: 'feeder', label: 'Feeder' }, { value: 'attack', label: 'Attack' }]} onChange={(purpose) => updateObject<HoseObject>(object.id, { purpose }, 'Change line use')} />}
        </Field>
      )}
      {object.hoseType === 'supply5' && (
        <Field label="Lay">
          {() => <Segmented label="Lay direction" value={object.layDirection ?? 'none'} options={[{ value: 'forward', label: 'Forward' }, { value: 'reverse', label: 'Reverse' }, { value: 'none', label: 'Not set' }]} onChange={(value) => {
            const { layDirection: _previous, ...rest } = object
            useBoard.getState().commit((all) => all.map((candidate) => candidate.id === object.id ? (value === 'none' ? rest : { ...rest, layDirection: value }) as SceneObject : candidate), 'Set lay direction')
          }} />}
        </Field>
      )}
      <Section title="Connections">
        <ul className="port-list">
          <ConnectionRow label="Source end" reference={object.from ? objectName(index.get(object.from.objectId)) : undefined} onDisconnect={() => disconnectHoseEnd(object.id, 'from')} />
          <ConnectionRow label="Far end" reference={object.to ? objectName(index.get(object.to.objectId)) : undefined} onDisconnect={() => disconnectHoseEnd(object.id, 'to')} />
        </ul>
        {issues.map((issue) => <p key={issue.id} className={`status-line status-line--${issue.severity === 'warning' ? 'warning' : 'info'}`}>{issue.message}</p>)}
        <p className="fine-print">Drag an end onto a port to connect it. Drag a point to reroute, drag a + to add a bend, double-tap a bend to remove it.</p>
      </Section>
      <div className="quick-actions">
        {!object.to && <Button icon={<Spline size={17} />} onClick={() => extendHose(object)}>Extend line</Button>}
        {object.points.length > 4 && <Button onClick={() => {
          const last = object.points.length - 2
          updateObject<HoseObject>(object.id, { points: [object.points[0]!, object.points[1]!, object.points[last]!, object.points[last + 1]!] }, 'Straighten line')
        }}>Straighten</Button>}
      </div>
      <Field label="Label (optional)">
        {(id) => <CommitText id={id} value={object.label} maxLength={40} placeholder="e.g. Line 1" onCommit={(label) => updateObject<HoseObject>(object.id, { label }, 'Label line')} />}
      </Field>
    </>
  )
}

function ConnectionRow({ label, reference, onDisconnect }: { label: string; reference?: string | undefined; onDisconnect: () => void }) {
  return (
    <li>
      <span className="port-list__name">{label}</span>
      <span className="port-list__state">{reference ?? 'Open end'}</span>
      {reference && <IconButton label={`Disconnect ${label.toLowerCase()}`} onClick={onDisconnect}><Unlink size={16} /></IconButton>}
    </li>
  )
}

const hydrantStatuses: Array<{ value: HydrantObject['status']; label: string }> = [
  { value: 'available', label: 'In service' },
  { value: 'low-pressure', label: 'Low pressure' },
  { value: 'out-of-service', label: 'Out of service' },
  { value: 'unknown', label: 'Unknown' },
]

function HydrantInspector({ object, supply }: { object: HydrantObject; supply: WaterSupplyReport }) {
  const objects = useBoard((state) => state.board.objects)
  const index = useMemo(() => new Map(objects.map((candidate) => [candidate.id, candidate])), [objects])
  const feeding = objects.filter((candidate): candidate is HoseObject => candidate.type === 'hose' && (candidate.from?.objectId === object.id || candidate.to?.objectId === object.id))
  const fed = [...supply.apparatus.entries()].filter(([, unit]) => unit.hydrantIds.includes(object.id)).map(([id]) => objectName(index.get(id)))
  return (
    <>
      <Header
        art={<span className="inspector__hydrant" aria-hidden />}
        title={<CommitText className="input input--title" value={object.label} maxLength={24} required aria-label="Hydrant label" onCommit={(label) => updateObject<HydrantObject>(object.id, { label }, 'Rename hydrant')} />}
        subtitle={fed.length ? `Supplying ${fed.join(', ')}` : feeding.length ? 'Line attached' : 'No lines attached'}
      />
      <Field label="Status">
        {() => <Segmented label="Hydrant status" value={object.status} options={hydrantStatuses} onChange={(status) => updateObject<HydrantObject>(object.id, { status }, 'Set hydrant status')} size="sm" />}
      </Field>
      <Field label="Instructor notes" hint="Shown exactly as entered (for example flow-test data). The simulator does not calculate pressure or flow.">
        {(id) => <CommitText id={id} multiline rows={3} maxLength={500} value={object.notes} onCommit={(notes) => updateObject<HydrantObject>(object.id, { notes }, 'Hydrant notes')} />}
      </Field>
      <div className="quick-actions">
        <Button onClick={() => startEvolutionFrom('forward-lay', object.id, 'storz')} disabled={feeding.length > 0}>Forward lay from here</Button>
      </div>
    </>
  )
}

function WyeInspector({ object }: { object: ApplianceObject }) {
  return (
    <>
      <Header title="Gated wye" subtitle="2½″ inlet · two 1½″ outlets" />
      <RotationControl object={object} />
      <div className="quick-actions">
        <Button onClick={() => startEvolutionFrom('high-rise-pack', object.id, 'outlet-b')}>Pull line from outlet B</Button>
      </div>
    </>
  )
}

function NozzleInspector({ object }: { object: NozzleObject }) {
  return (
    <>
      <Header title="Nozzle" subtitle="On a 1¾″ attack line" />
      <Field label="Type">
        {() => <Segmented label="Nozzle type" value={object.nozzleType} options={[{ value: 'fog', label: 'Fog' }, { value: 'smooth-bore', label: 'Smooth bore' }]} onChange={(nozzleType) => updateObject<NozzleObject>(object.id, { nozzleType }, 'Change nozzle')} />}
      </Field>
      <RotationControl object={object} />
    </>
  )
}

function MarkerInspector({ object }: { object: MarkerObject }) {
  const feetPerUnit = useBoard((state) => state.board.scenario.calibration?.feetPerWorldUnit)
  const definition = markerCatalog.find((marker) => marker.id === object.markerType)
  return (
    <>
      <Header art={<span className="inspector__badge" style={{ background: definition?.color }}>{definition?.code}</span>} title={definition?.label ?? 'Marker'} />
      <Field label="Label">
        {(id) => <CommitText id={id} value={object.label} maxLength={40} placeholder="e.g. Side A, Div 2" onCommit={(label) => updateObject<MarkerObject>(object.id, { label }, 'Label marker')} />}
      </Field>
      <Field label="Type">
        {(id) => (
          <select id={id} className="input" value={object.markerType} onChange={(event) => {
            const next = markerCatalog.find((marker) => marker.id === event.target.value)
            if (!next) return
            const radius = next.area || next.effect ? object.radius ?? defaultMarkerRadius(next.id, feetPerUnit) : undefined
            updateObject<MarkerObject>(object.id, { markerType: next.id, ...(radius ? { radius } : {}) }, 'Change marker')
          }}>
            {markerCatalog.map((marker) => <option key={marker.id} value={marker.id}>{marker.label}</option>)}
          </select>
        )}
      </Field>
      {object.radius !== undefined && (
        <Field label={`${definition?.effect ? 'Size' : 'Radius'} ${feetPerUnit ? '(ft)' : '(map units)'}`} hint={feetPerUnit ? (definition?.effect ? 'Or drag a corner handle on the map.' : undefined) : 'Calibrate the map to set this in feet.'}>
          {(id) => <input id={id} className="input input--number" type="number" min={1} value={Math.round(feetPerUnit ? object.radius! * feetPerUnit : object.radius!)} onChange={(event) => {
            const value = Number(event.target.value)
            if (value > 0) updateObject<MarkerObject>(object.id, { radius: Math.min(5000, feetPerUnit ? value / feetPerUnit : value) }, 'Resize zone')
          }} />}
        </Field>
      )}
      {definition?.effect && (
        <>
          <Field label="Height (%)" hint={definition.effect === 'smoke' ? 'How far the plume reaches. Or drag the top handle on the map.' : 'Taller or shorter flames. Or drag the top handle on the map.'}>
            {(id) => <input id={id} className="input input--number" type="number" min={30} max={400} step={10} value={Math.round((object.stretch ?? 1) * 100)} onChange={(event) => {
              const value = Number(event.target.value)
              if (value > 0) updateObject<MarkerObject>(object.id, { stretch: Math.min(4, Math.max(0.3, value / 100)) }, 'Stretch effect')
            }} data-testid="effect-height" />}
          </Field>
          <RotationControl object={object} />
        </>
      )}
    </>
  )
}

function NoteInspector({ object }: { object: NoteObject }) {
  return (
    <>
      <Header title="Note" />
      <Field label="Text">
        {(id) => <CommitText id={id} multiline required rows={4} maxLength={500} autoFocus value={object.text} onCommit={(text) => updateObject<NoteObject>(object.id, { text }, 'Edit note')} data-testid="note-text" />}
      </Field>
    </>
  )
}

function ArrowInspector({ object }: { object: ArrowObject }) {
  return (
    <>
      <Header title="Arrow" subtitle="Drag points to reshape" />
      <Field label="Color">
        {() => <Segmented label="Arrow color" value={object.color} options={[{ value: 'white', label: 'White' }, { value: 'yellow', label: 'Yellow' }, { value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }]} onChange={(color) => updateObject<ArrowObject>(object.id, { color }, 'Arrow color')} size="sm" />}
      </Field>
    </>
  )
}

function MeasurementInspector({ object }: { object: MeasurementObject }) {
  const calibration = useBoard((state) => state.board.scenario.calibration)
  const reading = readLength(polylineLength(object.points), calibration)
  return (
    <>
      <Header title="Measurement" subtitle={reading.calibrated ? 'Calibrated map' : 'Map not calibrated'} />
      <div className="readout"><div className="readout__main"><strong>{reading.calibrated ? Math.round(reading.feet!) : Math.round(reading.world)}</strong><span>{reading.calibrated ? 'ft' : 'map units'}</span></div></div>
    </>
  )
}

function MultiInspector({ objects }: { objects: SceneObject[] }) {
  const counts = objects.reduce<Record<string, number>>((tally, object) => ({ ...tally, [object.type]: (tally[object.type] ?? 0) + 1 }), {})
  return (
    <div className="inspector" data-testid="inspector" data-type="multiple">
      <Header title={`${objects.length} selected`} subtitle={Object.entries(counts).map(([type, count]) => `${count} ${type}`).join(' · ')} />
      <p className="fine-print">Drag any selected object to move them together. Use [ and ] to rotate vehicles, arrows keys to nudge.</p>
      <CommonActions object={objects[0]!} />
    </div>
  )
}
