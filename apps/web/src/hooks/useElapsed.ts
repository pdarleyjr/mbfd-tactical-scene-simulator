import { useEffect, useState } from 'react'
import type { TimerState } from '@mbfd/domain'
import { elapsedMs, sharedNow } from '../store/board'

/** Re-renders a few times a second while the scenario clock runs. */
export function useElapsed(timer: TimerState): number {
  const [now, setNow] = useState(() => sharedNow())
  useEffect(() => {
    if (!timer.running) return
    const interval = setInterval(() => setNow(sharedNow()), 250)
    return () => clearInterval(interval)
  }, [timer.running])
  return elapsedMs(timer, timer.running ? now : sharedNow())
}
