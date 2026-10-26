import { useRef, useState } from 'react'
import { Crosshair, ImageUp, Plus, RotateCcw, Trash2, Video } from 'lucide-react'
import { apparatusCatalog, defaultBenchmarkCatalog, defaultHoseLoads, hoseCatalog, type HoseLoads, type HoseType, type Scenario } from '@mbfd/domain'
import { useBoard } from '../../store/board'
import { useUi } from '../../store/ui'
import { attachVideo, replaceBackground } from '../../lib/workspace'
import { compassPoint } from '../../lib/format'
import { findTemplate } from '../../templates'
import { Button, CommitText, Field, IconButton, Modal, Segmented } from '../primitives'

type Tab = 'briefing' | 'training' | 'scale' | 'conditions'

/** Everything that defines the scenario, as opposed to what is on the map. */
export function SettingsDialog() {
  const close = useUi((state) => state.closeDialog)
  const [tab, setTab] = useState<Tab>('briefing')
  return (
    <Modal title="Scenario settings" subtitle="Changes save automatically and apply to this board only." onClose={close} size="lg" testId="settings-dialog">
      <Segmented label="Settings section" value={tab} onChange={setTab} options={[
        { value: 'briefing', label: 'Briefing' },
        { value: 'training', label: 'Injects & benchmarks' },
        { value: 'scale', label: 'Map, scale & hose' },
        { value: 'conditions', label: 'Conditions' },
      ]} />
      <div className="settings__body">
        {tab === 'briefing' && <BriefingSettings />}
        {tab === 'training' && <TrainingSettings />}
        {tab === 'scale' && <ScaleSettings />}
        {tab === 'conditions' && <ConditionsSettings />}
      </div>
    </Modal>
  )
}

function update(mutator: (scenario: Scenario) => Scenario) {
  useBoard.getState().updateScenario(mutator)
}

function BriefingSettings() {
  const scenario = useBoard((state) => state.board.scenario)
  const videoRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  return (
    <div className="settings__grid">
      <Field label="Title">{(id) => <CommitText id={id} required maxLength={160} value={scenario.title} onCommit={(title) => update((current) => ({ ...current, title }))} />}</Field>
      <Field label="Description">{(id) => <CommitText id={id} multiline rows={3} maxLength={4000} value={scenario.description} onCommit={(description) => update((current) => ({ ...current, description }))} />}</Field>
      <Field label="Dispatch information" hint="Shown in the Training panel and the debrief summary.">{(id) => <CommitText id={id} multiline rows={4} maxLength={4000} value={scenario.dispatch} onCommit={(dispatch) => update((current) => ({ ...current, dispatch }))} />}</Field>
      <Field label="Initial-conditions video">
        {() => (
          <div className="row">
            <span className="fine-print">{scenario.video ? (scenario.video.kind === 'builtin' ? 'Original scenario video' : scenario.video.name || 'Attached video') : 'No video attached'}</span>
            <Button icon={<Video size={17} />} onClick={() => videoRef.current?.click()}>{scenario.video ? 'Replace' : 'Attach video'}</Button>
            {scenario.video && <Button tone="quiet" onClick={() => update((current) => { const { video: _video, poster: _poster, ...rest } = current; return rest })}>Remove</Button>}
            <input ref={videoRef} type="file" accept="video/mp4,video/webm" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) attachVideo(file).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Video could not be attached.')) }} />
          </div>
        )}
      </Field>
      {error && <p className="status-line status-line--warning">{error}</p>}
    </div>
  )
}

function TrainingSettings() {
  const scenario = useBoard((state) => state.board.scenario)
  return (
    <div className="settings__grid">
      <div className="settings__list-head">
        <h3>Injects</h3>
        <Button icon={<Plus size={17} />} onClick={() => update((current) => ({ ...current, injects: [...current.injects, { id: crypto.randomUUID(), title: 'New inject', description: '' }] }))}>Add inject</Button>
      </div>
      {scenario.injects.length === 0 && <p className="fine-print">No injects. Add changing conditions to reveal during the scenario.</p>}
      {scenario.injects.map((inject, index) => (
        <div key={inject.id} className="edit-row">
          <CommitText aria-label={`Inject ${index + 1} title`} required maxLength={160} value={inject.title} onCommit={(title) => update((current) => ({ ...current, injects: current.injects.map((item) => item.id === inject.id ? { ...item, title } : item) }))} />
          <CommitText aria-label={`Inject ${index + 1} description`} maxLength={2000} value={inject.description} placeholder="What changes" onCommit={(description) => update((current) => ({ ...current, injects: current.injects.map((item) => item.id === inject.id ? { ...item, description } : item) }))} />
          <input className="input input--number" type="number" min={0} placeholder="Auto (s)" title="Reveal automatically at this many seconds on the scenario clock" aria-label={`Inject ${index + 1} automatic reveal time in seconds`} value={inject.revealAtSeconds ?? ''} onChange={(event) => {
            const value = event.target.value === '' ? undefined : Math.min(86_400, Math.max(0, Math.round(Number(event.target.value)) || 0))
            update((current) => ({ ...current, injects: current.injects.map((item) => {
              if (item.id !== inject.id) return item
              const { revealAtSeconds: _previous, ...rest } = item
              return value === undefined ? rest : { ...rest, revealAtSeconds: value }
            }) }))
          }} />
          <IconButton label={`Remove inject ${index + 1}`} onClick={() => update((current) => ({ ...current, injects: current.injects.filter((item) => item.id !== inject.id) }))}><Trash2 size={16} /></IconButton>
        </div>
      ))}
      <div className="settings__list-head">
        <h3>Benchmarks</h3>
        <div className="row">
          <Button tone="quiet" icon={<RotateCcw size={16} />} onClick={() => update((current) => ({ ...current, benchmarks: defaultBenchmarkCatalog.map((benchmark) => ({ ...benchmark })) }))}>Restore defaults</Button>
          <Button icon={<Plus size={17} />} onClick={() => update((current) => ({ ...current, benchmarks: [...current.benchmarks, { id: crypto.randomUUID(), label: 'New benchmark', description: '' }] }))}>Add benchmark</Button>
        </div>
      </div>
      {scenario.benchmarks.map((benchmark, index) => (
        <div key={benchmark.id} className="edit-row edit-row--two">
          <CommitText aria-label={`Benchmark ${index + 1}`} required maxLength={160} value={benchmark.label} onCommit={(label) => update((current) => ({ ...current, benchmarks: current.benchmarks.map((item) => item.id === benchmark.id ? { ...item, label } : item) }))} />
          <CommitText aria-label={`Benchmark ${index + 1} criteria`} maxLength={1000} value={benchmark.description} placeholder="Completion criteria" onCommit={(description) => update((current) => ({ ...current, benchmarks: current.benchmarks.map((item) => item.id === benchmark.id ? { ...item, description } : item) }))} />
          <IconButton label={`Remove benchmark ${index + 1}`} onClick={() => update((current) => ({ ...current, benchmarks: current.benchmarks.filter((item) => item.id !== benchmark.id) }))}><Trash2 size={16} /></IconButton>
        </div>
      ))}
    </div>
  )
}

const loadLabels: Record<keyof HoseLoads['loadLengthFt'], string> = {
  'forward-lay': 'Forward lay (5″)',
  'reverse-lay': 'Reverse lay (5″)',
  jumpline: 'Jumpline (1¾″)',
  'skid-load': 'Skid load feeder (3″)',
  'skid-load-attack': 'Skid load attack (1¾″)',
  'high-rise-pack': 'High-rise pack (1¾″)',
}

function ScaleSettings() {
  const board = useBoard((state) => state.board)
  const scenario = board.scenario
  const imageRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const template = findTemplate(board.templateId)
  const calibration = scenario.calibration
  return (
    <div className="settings__grid">
      <div className={`calibration-card ${calibration ? 'is-ok' : 'is-warning'}`}>
        <strong>{calibration ? `Calibrated: 1 map unit = ${calibration.feetPerWorldUnit.toFixed(3)} ft` : 'Not calibrated'}</strong>
        <span>{calibration ? `From a ${calibration.distanceFt} ft reference${calibration.reference ? ` (${calibration.reference})` : ''}, ${new Date(calibration.calibratedAt).toLocaleDateString()}.` : 'Distances read in map units (u). Calibrate with something on the image whose real length you know.'}</span>
        <div className="row">
          <Button tone="primary" icon={<Crosshair size={17} />} onClick={() => { useUi.getState().closeDialog(); useUi.getState().setTool('calibrate') }}>{calibration ? 'Recalibrate' : 'Calibrate now'}</Button>
          {calibration && <Button tone="quiet" onClick={() => update((current) => { const { calibration: _removed, ...rest } = current; return rest })}>Clear calibration</Button>}
        </div>
      </div>
      <Field label="Map image" hint={`${scenario.world.width} × ${scenario.world.height} px. Replacing it clears the calibration.`}>
        {() => (
          <div className="row">
            <Button icon={<ImageUp size={17} />} onClick={() => imageRef.current?.click()}>Replace map image</Button>
            {template && scenario.background.kind === 'blob' && <Button tone="quiet" onClick={() => update((current) => ({ ...current, background: template.scenario.background, world: template.scenario.world }))}>Use original image</Button>}
            <input ref={imageRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) replaceBackground(file).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Image could not be used.')) }} />
          </div>
        )}
      </Field>
      {error && <p className="status-line status-line--warning">{error}</p>}
      <h3>Apparatus length (verified, optional)</h3>
      <p className="fine-print">Leave blank unless you have the unit's verified overall length. With a calibrated map, entered lengths draw that unit to scale; blank units use a default drawing size.</p>
      <div className="length-grid">
        {apparatusCatalog.map((template) => (
          <label key={template.id} className="length-grid__item">
            <span>{template.id}</span>
            <input className="input input--number" type="number" min={10} max={120} step={0.5} placeholder="ft" value={scenario.apparatusLengthFt[template.id] ?? ''} onChange={(event) => {
              const value = event.target.value === '' ? undefined : Number(event.target.value)
              update((current) => {
                const lengths = { ...current.apparatusLengthFt }
                if (value && value > 0) lengths[template.id] = Math.min(200, value)
                else delete lengths[template.id]
                return { ...current, apparatusLengthFt: lengths }
              })
            }} />
          </label>
        ))}
      </div>
      <h3>Hose loads</h3>
      <p className="fine-print">Defaults carried over from V2. Set them to match MBFD hose loads; lines longer than their load are flagged.</p>
      <div className="length-grid">
        {(Object.keys(loadLabels) as Array<keyof HoseLoads['loadLengthFt']>).map((key) => (
          <label key={key} className="length-grid__item length-grid__item--wide">
            <span>{loadLabels[key]}</span>
            <input className="input input--number" type="number" min={25} max={5000} step={25} value={scenario.hoseLoads.loadLengthFt[key]} onChange={(event) => {
              const value = Number(event.target.value)
              if (value > 0) update((current) => ({ ...current, hoseLoads: { ...current.hoseLoads, loadLengthFt: { ...current.hoseLoads.loadLengthFt, [key]: Math.min(10_000, value) } } }))
            }} />
          </label>
        ))}
      </div>
      <h3>Section length</h3>
      <div className="length-grid">
        {(Object.keys(hoseCatalog) as HoseType[]).map((type) => (
          <label key={type} className="length-grid__item length-grid__item--wide">
            <span>{hoseCatalog[type].label}</span>
            <input className="input input--number" type="number" min={10} max={200} step={5} value={scenario.hoseLoads.sectionLengthFt[type]} onChange={(event) => {
              const value = Number(event.target.value)
              if (value > 0) update((current) => ({ ...current, hoseLoads: { ...current.hoseLoads, sectionLengthFt: { ...current.hoseLoads.sectionLengthFt, [type]: Math.min(1000, value) } } }))
            }} />
          </label>
        ))}
      </div>
      <Button tone="quiet" icon={<RotateCcw size={16} />} onClick={() => update((current) => ({ ...current, hoseLoads: structuredClone(defaultHoseLoads) }))}>Restore hose defaults</Button>
    </div>
  )
}

const windOptions = [null, 0, 45, 90, 135, 180, 225, 270, 315] as const

function ConditionsSettings() {
  const conditions = useBoard((state) => state.board.scenario.conditions)
  const set = (patch: Partial<Scenario['conditions']>) => update((current) => ({ ...current, conditions: { ...current.conditions, ...patch } }))
  return (
    <div className="settings__grid">
      <Field label="Wind from" hint="Direction relative to the top of the map.">
        {(id) => (
          <select id={id} className="input" value={conditions.windFromDeg ?? ''} onChange={(event) => set({ windFromDeg: event.target.value === '' ? null : Number(event.target.value) })}>
            {windOptions.map((value) => <option key={String(value)} value={value ?? ''}>{value === null ? 'Not shown' : `${compassPoint(value)} (${value}°)`}</option>)}
          </select>
        )}
      </Field>
      <Field label="Wind note">{(id) => <CommitText id={id} maxLength={80} value={conditions.windNote} placeholder="e.g. 15 mph, gusting" onCommit={(windNote) => set({ windNote })} />}</Field>
      <Field label="North arrow" hint="Rotate if north is not at the top of the image.">
        {(id) => <input id={id} className="input input--number" type="number" min={0} max={359} value={conditions.northDeg} onChange={(event) => set({ northDeg: ((Number(event.target.value) % 360) + 360) % 360 })} />}
      </Field>
      <Field label="Weather and other conditions">{(id) => <CommitText id={id} multiline rows={3} maxLength={200} value={conditions.weather} placeholder="e.g. Night, heavy rain, high tide" onCommit={(weather) => set({ weather })} />}</Field>
    </div>
  )
}
