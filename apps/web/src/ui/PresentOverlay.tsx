import { useEffect, useState } from 'react'
import { Check, ChevronRight, ClipboardCheck, Link2, Maximize2, Minimize2, Pause, Play, Video } from 'lucide-react'
import { useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { useElapsed } from '../hooks/useElapsed'
import { formatElapsed } from '../lib/format'
import { exitPresentation } from '../lib/presentation'
import { sceneLink, useLive } from '../lib/live'
import { canvasApi } from '../canvas/api'
import { copyLink } from '../lib/clipboard'

/**
 * Classroom view: the live scene, the clock, and large readable training cues.
 * Everything people change while working the scene appears here as it happens.
 * Opened from the display link it is view-only, for a TV or projector.
 */
export function PresentOverlay() {
  const board = useBoard((state) => state.board)
  const { scenario, training } = board
  const elapsed = useElapsed(training.timer)
  const [showBenchmarks, setShowBenchmarks] = useState(false)
  const next = scenario.injects.find((inject) => !(inject.id in training.revealed))
  const display = useUi((state) => state.display)
  const connection = useLive((state) => state.connection)
  const peers = useLive((state) => state.peers)
  const sceneId = useLive((state) => state.sceneId)
  const [fullscreen, setFullscreen] = useState(() => Boolean(document.fullscreenElement))

  useEffect(() => {
    const onChange = () => {
      setFullscreen(Boolean(document.fullscreenElement))
      if (!document.fullscreenElement && useUi.getState().presenting && !useUi.getState().display) useUi.getState().setPresenting(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // A wall display keeps the whole scene in view whatever the screen size.
  useEffect(() => {
    if (!display) return
    const fit = () => canvasApi.current?.fit()
    const timer = setTimeout(fit, 300)
    addEventListener('resize', fit)
    return () => { clearTimeout(timer); removeEventListener('resize', fit) }
  }, [display])

  return (
    <div className="present" data-testid="present-overlay">
      <div className="present__title">
        <img src="/mbfd-seal-96.webp" alt="" width={56} height={56} />
        <div>
          <span>Miami Beach Fire Rescue · Tactical training</span>
          <h1>{scenario.title}</h1>
        </div>
      </div>
      <div className="present__clock" aria-label="Scenario elapsed time">{formatElapsed(elapsed)}</div>
      <div className="present__live" data-connection={connection} data-testid="present-live" role="status">
        <span aria-hidden />{connection === 'live' ? `Live${peers > 1 ? ` · ${peers} connected` : ''}` : 'Reconnecting…'}
      </div>
      {showBenchmarks && (
        <ul className="present__benchmarks" aria-label="Benchmarks">
          {scenario.benchmarks.map((benchmark) => {
            const done = benchmark.id in training.completed
            return (
              <li key={benchmark.id} className={done ? 'is-done' : ''}>
                <button type="button" onClick={() => useBoard.getState().toggleBenchmark(benchmark.id)} aria-pressed={done}>
                  <span className="present__check">{done && <Check size={18} />}</span>
                  {benchmark.label}
                  {done && <small>{formatElapsed(training.completed[benchmark.id]!)}</small>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {display ? (
        !fullscreen && (
          <div className="present__controls" role="toolbar" aria-label="Display controls">
            <button type="button" onClick={() => void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined)} data-testid="display-fullscreen"><Maximize2 size={22} /><span>Full screen</span></button>
          </div>
        )
      ) : (
      <div className="present__controls" role="toolbar" aria-label="Presentation controls">
        <button type="button" onClick={() => training.timer.running ? useBoard.getState().pauseTimer() : useBoard.getState().startTimer()} aria-label={training.timer.running ? 'Pause clock' : 'Start clock'}>
          {training.timer.running ? <Pause size={22} /> : <Play size={22} />}
        </button>
        {next && (
          <button type="button" onClick={() => { useBoard.getState().revealInject(next.id); useUi.getState().showInjectBanner(next.id) }} title={`Reveal: ${next.title}`}>
            <ChevronRight size={22} /><span>Next inject</span>
          </button>
        )}
        <button type="button" className={showBenchmarks ? 'is-active' : ''} onClick={() => setShowBenchmarks((value) => !value)}>
          <ClipboardCheck size={22} /><span>{Object.keys(training.completed).length}/{scenario.benchmarks.length}</span>
        </button>
        {scenario.video && <button type="button" onClick={() => useUi.getState().openDialog('video')} aria-label="Play initial conditions video"><Video size={22} /></button>}
        <button type="button" onClick={() => void copyLink(sceneLink(sceneId, { display: true }), 'Classroom display link')} title="Open this link on the classroom TV to show the scene live" data-testid="present-display-link"><Link2 size={22} /><span>Display link</span></button>
        <button type="button" onClick={exitPresentation} data-testid="exit-present"><Minimize2 size={22} /><span>Exit</span></button>
      </div>
      )}
    </div>
  )
}
