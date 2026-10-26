import { useBoard } from '../store/board'
import { useUi, type Toast } from '../store/ui'

/**
 * A toast whose Undo reverses exactly the action it announced. If anything
 * else changed the board since, it refuses rather than undoing the wrong step.
 */
export function offerUndo(message: string, tone: Toast['tone'] = 'info') {
  const marker = useBoard.getState().past.length
  useUi.getState().toast(message, tone, {
    label: 'Undo',
    run: () => {
      if (useBoard.getState().past.length === marker) useBoard.getState().undo()
      else useUi.getState().toast('The board changed after that action, so Undo was skipped. Use Ctrl+Z to step back.', 'warning')
    },
  })
}
