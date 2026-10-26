import Konva from 'konva'
import { useBoard } from './store/board'
import { useUi } from './store/ui'
import { canvasApi } from './canvas/api'
import { worldToScreen } from './canvas/viewport'

/**
 * Development-only window hook for end-to-end tests: lets a test read the
 * scene model and convert world coordinates to screen pixels. Never bundled
 * into production builds (guarded by import.meta.env.DEV in main.tsx).
 */
export function installTestHook() {
  Object.assign(window, {
    __sim: {
      board: () => useBoard.getState().board,
      ui: () => useUi.getState(),
      store: useBoard,
      uiStore: useUi,
      toScreen: (x: number, y: number) => {
        const host = document.querySelector('[data-testid="scene-canvas"]')!.getBoundingClientRect()
        const point = worldToScreen({ x, y }, useUi.getState().view)
        return { x: host.left + point.x, y: host.top + point.y }
      },
      fit: () => canvasApi.current?.fit(),
      /** Rendered canvas nodes by name, e.g. 'apparatus' or 'hose'. */
      rendered: (name: string) => Konva.stages[0]?.find(`.${name}`).length ?? 0,
    },
  })
}
