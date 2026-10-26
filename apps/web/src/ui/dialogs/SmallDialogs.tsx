import { useState } from 'react'
import { distance, calibrationFromReference } from '@mbfd/fire-model'
import { useBoard } from '../../store/board'
import { useUi } from '../../store/ui'
import { useMediaUrl } from '../../lib/session'
import { resetToBaseline } from '../../lib/workspace'
import { Button, Kbd, Modal } from '../primitives'

export function CalibrationDialog() {
  const pending = useUi((state) => state.pendingCalibration)
  const calibration = useBoard((state) => state.board.scenario.calibration)
  const [feet, setFeet] = useState('')
  const [reference, setReference] = useState('')
  const [error, setError] = useState('')
  const close = () => { useUi.getState().setPendingCalibration(null); useUi.getState().closeDialog() }
  if (!pending) return null
  const world = distance(pending.a, pending.b)
  function apply() {
    try {
      const next = calibrationFromReference(pending!.a, pending!.b, Number(feet), reference)
      useBoard.getState().updateScenario((scenario) => ({ ...scenario, calibration: next }))
      useUi.getState().setTool('measure')
      useUi.getState().toast(`Map calibrated: 1 map unit = ${next.feetPerWorldUnit.toFixed(3)} ft.`, 'success')
      close()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enter a valid distance.')
    }
  }
  return (
    <Modal
      title="Calibrate the map"
      subtitle={`You marked a line ${Math.round(world)} map units long. How long is it on the ground?`}
      onClose={close}
      size="sm"
      testId="calibration-dialog"
      footer={<><Button tone="quiet" onClick={close}>Cancel</Button><Button tone="primary" onClick={apply} data-testid="apply-calibration">Apply calibration</Button></>}
    >
      <form className="settings__grid" onSubmit={(event) => { event.preventDefault(); apply() }}>
        <label className="field">
          <span className="field__label">Real distance (feet)</span>
          <input className="input input--large" type="number" inputMode="decimal" min={0.1} step="any" autoFocus value={feet} onChange={(event) => setFeet(event.target.value)} data-testid="calibration-feet" />
        </label>
        <label className="field">
          <span className="field__label">What you measured (optional)</span>
          <input className="input" maxLength={120} value={reference} placeholder="e.g. Lot frontage from survey" onChange={(event) => setReference(event.target.value)} />
        </label>
        <p className="fine-print">Use a distance you know is correct for this image: a surveyed lot line, a measured driveway, or a regulation court (a tennis court is 78 ft long). Every length on the map, including hose routes, uses this one reference.</p>
        {calibration && <p className="fine-print">This replaces the current calibration ({calibration.distanceFt} ft reference).</p>}
        {error && <p className="status-line status-line--warning">{error}</p>}
      </form>
    </Modal>
  )
}

export function VideoDialog() {
  const video = useBoard((state) => state.board.scenario.video)
  const poster = useBoard((state) => state.board.scenario.poster)
  const title = useBoard((state) => state.board.scenario.title)
  const src = useMediaUrl(video)
  const posterSrc = useMediaUrl(poster)
  const close = useUi((state) => state.closeDialog)
  return (
    <Modal title="Initial conditions" subtitle={title} onClose={close} size="lg" testId="video-dialog">
      {src
        ? <video className="video" src={src} poster={posterSrc} controls autoPlay playsInline preload="metadata" data-testid="initial-video" />
        : <p className="fine-print">No video is attached to this scenario.</p>}
    </Modal>
  )
}

export function ResetDialog() {
  const close = useUi((state) => state.closeDialog)
  return (
    <Modal
      title="Reset to the original scenario?"
      subtitle="Everything on the map returns to how the scenario starts."
      onClose={close}
      size="sm"
      testId="reset-dialog"
      footer={<><Button tone="quiet" onClick={close}>Keep my board</Button><Button tone="danger" onClick={() => { resetToBaseline(); close() }} data-testid="confirm-reset">Reset map</Button></>}
    >
      <p>Your current layout is saved as a snapshot first, and Undo brings it straight back. The scenario clock, injects, benchmarks, and settings are not changed.</p>
    </Modal>
  )
}

const shortcuts: Array<[string, string]> = [
  ['V', 'Select and move'],
  ['A', 'Apparatus'],
  ['H', 'Hose'],
  ['Y', 'Hydrant'],
  ['M', 'Markers'],
  ['T', 'Note'],
  ['D', 'Arrow'],
  ['R', 'Measure'],
  ['Esc', 'Cancel or finish the current action'],
  ['Enter', 'Finish the line being drawn'],
  ['Backspace', 'Remove the last point while drawing'],
  ['Delete', 'Delete selection'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'],
  ['Ctrl+D', 'Duplicate selection'],
  ['Ctrl+C / Ctrl+V', 'Copy / paste'],
  ['[ and ]', 'Rotate 15° (Shift: 1°)'],
  ['Arrow keys', 'Nudge (Shift: 10×)'],
  ['L', 'Lock or unlock selection'],
  ['F', 'Fit scene to screen'],
  ['P', 'Present'],
  ['Space + drag', 'Pan the map'],
  ['Shift + drag', 'Select an area'],
]

export function ShortcutsDialog() {
  const close = useUi((state) => state.closeDialog)
  return (
    <Modal title="Keyboard shortcuts" onClose={close} size="md" testId="shortcuts-dialog">
      <dl className="shortcuts">
        {shortcuts.map(([key, label]) => (
          <div key={key}><dt><Kbd>{key}</Kbd></dt><dd>{label}</dd></div>
        ))}
      </dl>
      <p className="fine-print">On a touchscreen: drag empty map to pan, pinch to zoom, tap to select, drag to move.</p>
    </Modal>
  )
}
