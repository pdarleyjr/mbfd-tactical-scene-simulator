import { useEffect } from 'react'
import { elapsedMs, useBoard } from '../store/board'
import { useUi } from '../store/ui'

/** Reveals injects that carry an automatic time once the clock passes it. */
export function useInjectSchedule() {
  const running = useBoard((state) => state.board.training.timer.running)
  // A classroom display only shows the scene; the people working it reveal injects.
  const display = useUi((state) => state.display)
  useEffect(() => {
    if (!running || display) return
    const interval = setInterval(() => {
      const { board, revealInject } = useBoard.getState()
      const now = elapsedMs(board.training.timer)
      for (const inject of board.scenario.injects) {
        if (inject.revealAtSeconds === undefined || inject.id in board.training.revealed) continue
        if (now >= inject.revealAtSeconds * 1000) {
          revealInject(inject.id)
          useUi.getState().showInjectBanner(inject.id)
        }
      }
    }, 500)
    return () => clearInterval(interval)
  }, [running, display])
}
