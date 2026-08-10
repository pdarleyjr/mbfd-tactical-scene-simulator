import type { SessionRecord } from './model.js'

export function sessionElapsedMs(session: Pick<SessionRecord, 'status' | 'accumulatedElapsedMs' | 'timerAnchorAt'>, at = new Date()): number {
  const activeSegment = session.status === 'running' && session.timerAnchorAt
    ? at.getTime() - new Date(session.timerAnchorAt).getTime()
    : 0
  return Math.max(0, Math.round(session.accumulatedElapsedMs + activeSegment))
}
