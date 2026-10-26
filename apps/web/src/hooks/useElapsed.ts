import { useEffect, useState } from 'react'
import type { TimerState } from '@mbfd/domain'
import { elapsedMs } from '../store/board'

/** Re-renders a few times a second while the scenario clock runs. */
export function useElapsed(timer: TimerState): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!timer.running) return
    const interval = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(interval)
  }, [timer.running])
  return elapsedMs(timer, timer.running ? now : Date.now())
}
