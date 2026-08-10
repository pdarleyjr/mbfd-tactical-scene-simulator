import { useEffect, useState } from 'react'

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor(totalSeconds / 60) % 60
  const seconds = totalSeconds % 60
  return `${hours ? `${hours.toString().padStart(2, '0')}:` : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function ScenarioTimer(props: { elapsedMs: number; status: 'setup' | 'running' | 'frozen' | 'complete'; compact?: boolean }) {
  const [displayMs, setDisplayMs] = useState(props.elapsedMs)
  useEffect(() => {
    setDisplayMs(props.elapsedMs)
    if (props.status !== 'running') return
    const started = performance.now()
    const interval = window.setInterval(() => setDisplayMs(props.elapsedMs + performance.now() - started), 250)
    return () => clearInterval(interval)
  }, [props.elapsedMs, props.status])

  return <div className={props.compact ? 'text-right' : 'border border-[#53646e] bg-[#090d10] p-3 text-center'} aria-label={`Scenario timer ${props.status}`}>
    {!props.compact && <span className="eyebrow block">Scenario timer · {props.status}</span>}
    <time className={`display tabular-nums text-[#f4ecd9] ${props.compact ? 'text-lg' : 'mt-1 block text-4xl'}`} data-testid="scenario-timer">{formatElapsed(displayMs)}</time>
  </div>
}
