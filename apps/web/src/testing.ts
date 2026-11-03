import Konva from 'konva'
import { findPort, portWorldPosition } from '@mbfd/fire-model'
import { sceneContext, useBoard } from './store/board'
import { useUi } from './store/ui'
import { canvasApi } from './canvas/api'
import { worldToScreen } from './canvas/viewport'
import { dropConnectionForTests } from './lib/live'

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
      /** World position of an object's connection point. */
      portAt: (objectId: string, portId: string) => {
        const board = useBoard.getState().board
        const object = board.objects.find((candidate) => candidate.id === objectId)
        const port = object ? findPort(object, portId, sceneContext(board.scenario)) : undefined
        return object && port ? portWorldPosition(object, port) : null
      },
      /** Simulates a dropped connection that returns after a few seconds. */
      dropConnection: () => dropConnectionForTests(2500),
      /** Rendered canvas nodes by name, e.g. 'apparatus' or 'hose'. */
      rendered: (name: string) => Konva.stages[0]?.find(`.${name}`).length ?? 0,
      /**
       * Hose length labels as drawn: the on-screen font size (text size times
       * every scale above it) and the pill's box in page pixels.
       */
      hoseLabels: () => {
        const stage = Konva.stages[0]
        const host = document.querySelector('[data-testid="scene-canvas"]')!.getBoundingClientRect()
        return (stage?.find('.hose-length-label') ?? []).map((group) => {
          const text = (group as Konva.Group).findOne('.hose-length-text') as Konva.Text
          const box = group.getClientRect()
          return { id: group.id().replace(/^label-/, ''), text: text.text(), fontPx: text.fontSize() * text.getAbsoluteScale().y, x: host.left + box.x, y: host.top + box.y, width: box.width, height: box.height }
        })
      },
      /** A transform-frame handle's box in page pixels (e.g. 'rotater', 'top-center'). */
      anchor: (name: string) => {
        const node = (Konva.stages[0]?.findOne('Transformer') as Konva.Transformer | undefined)?.findOne(`.${name}`)
        if (!node || !node.isVisible()) return null
        const box = node.getClientRect()
        const host = document.querySelector('[data-testid="scene-canvas"]')!.getBoundingClientRect()
        return { x: host.left + box.x + box.width / 2, y: host.top + box.y + box.height / 2, width: box.width, height: box.height }
      },
    },
  })
}
