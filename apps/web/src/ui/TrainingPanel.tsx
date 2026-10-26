import { useState } from 'react'
import { Camera, Check, Eye, EyeOff, FileText, History, Pause, Play, RotateCcw, Trash2, Video, X } from 'lucide-react'
import { useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { useElapsed } from '../hooks/useElapsed'
import { formatElapsed } from '../lib/format'
import { downloadDebrief } from '../lib/debrief'
import { offerUndo } from '../lib/undo'
import { Button, CommitText, IconButton, Section } from './primitives'

/** Briefing, clock, injects, benchmarks, snapshots, and debrief for one operator. */
export function TrainingPanel() {
  const board = useBoard((state) => state.board)
  const { scenario, training } = board
  const elapsed = useElapsed(training.timer)
  const compareSnapshotId = useUi((state) => state.compareSnapshotId)
  const [confirmReset, setConfirmReset] = useState(false)
  const store = useBoard.getState
  const ui = useUi.getState
  const reviewable = Boolean(board.run && board.run.entries.length)

  return (
    <div className="training" data-testid="training-panel">
      <header className="inspector__head">
        <div className="inspector__titles">
          <h2>Training</h2>
          <p>{scenario.title}</p>
        </div>
        <IconButton label="Close training panel" onClick={() => ui().setPanel('none')}><X size={18} /></IconButton>
      </header>

      <Section title="Dispatch">
        <p className="dispatch" data-testid="dispatch-text">{scenario.dispatch || 'No dispatch information. Add it in Scenario settings.'}</p>
        {scenario.conditions.weather && <p className="status-line status-line--info">Conditions: {scenario.conditions.weather}</p>}
        {scenario.video && <Button icon={<Video size={17} />} onClick={() => ui().openDialog('video')} data-testid="play-video">Play initial conditions</Button>}
      </Section>

      <Section title="Scenario clock" aside={<output className="clock" aria-label="Elapsed time">{formatElapsed(elapsed)}</output>}>
        <div className="row">
          {training.timer.running
            ? <Button icon={<Pause size={17} />} onClick={() => store().pauseTimer()}>Pause</Button>
            : <Button tone="primary" icon={<Play size={17} />} onClick={() => store().startTimer()} data-testid="start-timer">{training.timer.accumulatedMs ? 'Resume' : 'Start'}</Button>}
          {confirmReset
            ? <>
                <Button tone="danger" onClick={() => { store().resetRun(); setConfirmReset(false); ui().toast('Clock, injects, and benchmarks reset. Scene objects were not changed.', 'info') }}>Confirm reset</Button>
                <Button tone="quiet" onClick={() => setConfirmReset(false)}>Keep</Button>
              </>
            : <Button tone="quiet" icon={<RotateCcw size={17} />} disabled={!training.timer.accumulatedMs && !training.timer.running && !board.run} onClick={() => setConfirmReset(true)}>Reset run</Button>}
        </div>
        {!board.run && <p className="fine-print">Starting the clock records every change so you can replay the run at the debrief.</p>}
      </Section>

      <Section title={`Injects · ${Object.keys(training.revealed).length}/${scenario.injects.length}`}>
        {scenario.injects.length === 0 && <p className="fine-print">No injects in this scenario.</p>}
        <ul className="list">
          {scenario.injects.map((inject) => {
            const revealedAt = training.revealed[inject.id]
            return (
              <li key={inject.id} className={`list__item ${revealedAt !== undefined ? 'is-done' : ''}`}>
                <div className="list__text">
                  <strong>{inject.title}</strong>
                  <span>{inject.description}</span>
                  <small>{revealedAt !== undefined ? `Revealed at ${formatElapsed(revealedAt)}` : inject.revealAtSeconds !== undefined ? `Auto at ${formatElapsed(inject.revealAtSeconds * 1000)}` : 'Reveal when ready'}</small>
                </div>
                {revealedAt === undefined
                  ? <Button icon={<Eye size={17} />} onClick={() => { store().revealInject(inject.id); ui().showInjectBanner(inject.id) }} data-testid={`reveal-${inject.id}`}>Reveal</Button>
                  : <IconButton label={`Hide ${inject.title}`} onClick={() => store().concealInject(inject.id)}><EyeOff size={17} /></IconButton>}
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title={`Benchmarks · ${Object.keys(training.completed).length}/${scenario.benchmarks.length}`}>
        <ul className="list">
          {scenario.benchmarks.map((benchmark) => {
            const doneAt = training.completed[benchmark.id]
            return (
              <li key={benchmark.id} className={`list__item ${doneAt !== undefined ? 'is-done' : ''}`}>
                <button type="button" className="check" role="checkbox" aria-checked={doneAt !== undefined} onClick={() => store().toggleBenchmark(benchmark.id)} data-testid={`benchmark-${benchmark.id}`}>
                  {doneAt !== undefined && <Check size={16} />}
                </button>
                <div className="list__text">
                  <strong>{benchmark.label}</strong>
                  {benchmark.description && <span>{benchmark.description}</span>}
                  {doneAt !== undefined && <small>Completed at {formatElapsed(doneAt)}</small>}
                </div>
              </li>
            )
          })}
        </ul>
      </Section>

      <Section title="Snapshots" aside={<Button icon={<Camera size={17} />} onClick={() => { const snapshot = store().addSnapshot(`Snapshot ${board.snapshots.length + 1}`); ui().toast(`Saved “${snapshot.name}”.`, 'success') }} data-testid="capture-snapshot">Capture</Button>}>
        {board.snapshots.length === 0 && <p className="fine-print">Capture the board at key decision points to compare plans or restore one later.</p>}
        <ul className="list">
          {[...board.snapshots].reverse().map((snapshot) => (
            <li key={snapshot.id} className="list__item">
              <div className="list__text">
                <strong>{snapshot.name}</strong>
                <small>{snapshot.objects.length} objects{snapshot.elapsedMs !== null ? ` · at ${formatElapsed(snapshot.elapsedMs)}` : ''}</small>
              </div>
              <div className="list__actions">
                <Button tone={compareSnapshotId === snapshot.id ? 'primary' : 'quiet'} onClick={() => ui().setCompareSnapshot(compareSnapshotId === snapshot.id ? null : snapshot.id)} title="Show this snapshot as a dashed outline over the current board">{compareSnapshotId === snapshot.id ? 'Comparing' : 'Compare'}</Button>
                <Button tone="quiet" onClick={() => { store().restoreSnapshot(snapshot.id); offerUndo(`Restored “${snapshot.name}”.`, 'success') }}>Restore</Button>
                <IconButton label={`Delete ${snapshot.name}`} onClick={() => { store().deleteSnapshot(snapshot.id); if (compareSnapshotId === snapshot.id) ui().setCompareSnapshot(null) }}><Trash2 size={16} /></IconButton>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Debrief">
        <div className="row">
          <Button icon={<History size={17} />} disabled={!reviewable} onClick={() => ui().setReviewing(true)} data-testid="start-review">Replay this run</Button>
          <Button icon={<FileText size={17} />} onClick={() => downloadDebrief(useBoard.getState().board)}>Download summary</Button>
        </div>
        <CommitText multiline rows={4} maxLength={20_000} value={training.notes} placeholder="Debrief notes: decisions, positioning, what to change next time." aria-label="Debrief notes" onCommit={(notes) => store().updateTraining((current) => ({ ...current, notes }))} />
      </Section>
    </div>
  )
}
