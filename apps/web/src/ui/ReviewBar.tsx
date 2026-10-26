import { useEffect, useMemo, useState } from 'react'
import { Pause, Play, SkipBack, X } from 'lucide-react'
import { useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { formatElapsed } from '../lib/format'

const speeds = [1, 2, 4, 8, 16]

/** Scrub or play back the recorded run; the map shows the scene at that moment. */
export function ReviewBar() {
  const run = useBoard((state) => state.board.run)
  const atMs = useUi((state) => state.reviewAtMs)
  const setAt = useUi((state) => state.setReviewAt)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(4)
  const end = useMemo(() => Math.max(1000, ...(run?.entries.map((entry) => entry.at) ?? [0])) + 1000, [run])
  const markers = useMemo(() => (run?.entries ?? []).filter((entry) => entry.kind !== 'change'), [run])
  const recent = useMemo(() => (run?.entries ?? []).filter((entry) => entry.at <= atMs).slice(-4).reverse(), [run, atMs])

  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    let frame = 0
    const step = (now: number) => {
      const next = Math.min(end, useUi.getState().reviewAtMs + (now - last) * speed)
      last = now
      useUi.getState().setReviewAt(next)
      if (next >= end) { setPlaying(false); return }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, end])

  if (!run) return null
  return (
    <div className="review" data-testid="review-bar">
      <div className="review__head">
        <strong>Replaying run</strong>
        <span>Started {new Date(run.startedAt).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })} · {run.entries.length} recorded changes</span>
        <button type="button" className="btn btn--quiet" onClick={() => useUi.getState().setReviewing(false)} data-testid="exit-review"><X size={18} /><span>Back to editing</span></button>
      </div>
      <div className="review__controls">
        <button type="button" className="icon-btn" aria-label="Back to start" onClick={() => setAt(0)}><SkipBack size={18} /></button>
        <button type="button" className="icon-btn icon-btn--primary" aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={() => { if (atMs >= end) setAt(0); setPlaying((value) => !value) }}>
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <div className="review__track">
          <input type="range" min={0} max={end} step={250} value={Math.min(atMs, end)} onChange={(event) => { setPlaying(false); setAt(Number(event.target.value)) }} aria-label="Replay position" data-testid="review-scrubber" />
          <div className="review__ticks" aria-hidden>
            {markers.map((entry) => <span key={entry.id} className={`review__tick review__tick--${entry.kind}`} style={{ left: `${(entry.at / end) * 100}%` }} title={entry.label} />)}
          </div>
        </div>
        <output className="review__time">{formatElapsed(atMs)} / {formatElapsed(end)}</output>
        <select className="input input--compact" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Playback speed">
          {speeds.map((value) => <option key={value} value={value}>{value}×</option>)}
        </select>
      </div>
      <ol className="review__events" aria-label="Recent events">
        {recent.map((entry) => (
          <li key={entry.id} className={`review__event review__event--${entry.kind}`}>
            <button type="button" onClick={() => { setPlaying(false); setAt(entry.at) }}><time>{formatElapsed(entry.at)}</time> {entry.label}</button>
          </li>
        ))}
      </ol>
    </div>
  )
}
