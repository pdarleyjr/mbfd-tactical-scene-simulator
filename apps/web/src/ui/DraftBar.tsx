import { Check, Pin, Undo2, X } from 'lucide-react'
import { polylineLength, readLength } from '@mbfd/fire-model'
import { useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { cancelDraft, currentHoseSpec, finishDraft, pinMeasurement, undoDraftPoint } from '../canvas/drafting'
import { evolutionCatalog, hoseCatalog } from '@mbfd/domain'

/** Prompt and controls for the line being drawn, at the bottom of the map. */
export function DraftBar() {
  const tool = useUi((state) => state.tool)
  const draft = useUi((state) => state.draft)
  const calibration = useBoard((state) => state.board.scenario.calibration)
  if (!['hose', 'arrow', 'measure', 'calibrate'].includes(tool)) return null

  const points = draft?.points ?? []
  const count = points.length / 2
  const length = readLength(polylineLength(points), calibration)
  let prompt = ''
  let title = ''
  if (tool === 'hose') {
    const spec = currentHoseSpec(draft)
    title = spec.evolutionId ? evolutionCatalog.find((item) => item.id === spec.evolutionId)?.label ?? '' : hoseCatalog[spec.hoseType].label
    if (spec.step) prompt = count === 0 ? spec.step.prompt.start : spec.step.prompt.route
    else prompt = count === 0 ? 'Tap where the line starts. Start on a port to connect it.' : 'Keep tapping the route. Tap a port to connect, or tap the last point to finish.'
  } else if (tool === 'arrow') {
    title = 'Arrow'
    prompt = count === 0 ? 'Tap where the arrow starts.' : 'Tap the next point. Tap the last point again to finish.'
  } else if (tool === 'measure') {
    title = 'Measure'
    prompt = count === 0 ? 'Tap the first point.' : 'Tap more points to follow a route.'
  } else {
    title = 'Calibrate'
    prompt = count === 0 ? 'Tap one end of a known distance.' : 'Tap the other end.'
  }
  const step = tool === 'hose' ? currentHoseSpec(draft).step : undefined
  const over = step && length.feet !== undefined && length.feet > step.loadFt

  return (
    <div className="draftbar" role="region" aria-label={`${title} drawing controls`} data-testid="draft-bar">
      <div className="draftbar__text">
        <strong>{title}</strong>
        <span role="status" aria-live="polite" data-testid="draft-prompt">{prompt}</span>
      </div>
      {count >= 2 && tool !== 'calibrate' && (
        <output className={`draftbar__length ${over ? 'is-over' : ''} ${length.calibrated ? '' : 'is-uncalibrated'}`} data-testid="draft-length">
          {length.text}
          {step && <small>of {step.loadFt} ft load</small>}
          {!length.calibrated && <small>uncalibrated</small>}
        </output>
      )}
      <div className="draftbar__actions">
        <button type="button" className="btn btn--quiet" disabled={!count} onClick={undoDraftPoint}><Undo2 size={18} /><span>Undo point</span></button>
        <button type="button" className="btn btn--quiet" disabled={!count} onClick={cancelDraft}><X size={18} /><span>{tool === 'measure' ? 'Clear' : 'Cancel'}</span></button>
        {tool === 'measure'
          ? <button type="button" className="btn btn--primary" disabled={count < 2} onClick={pinMeasurement}><Pin size={18} /><span>Pin</span></button>
          : tool !== 'calibrate' && <button type="button" className="btn btn--primary" disabled={count < 2} onClick={() => finishDraft()} data-testid="finish-line"><Check size={18} /><span>Finish</span></button>}
      </div>
    </div>
  )
}
