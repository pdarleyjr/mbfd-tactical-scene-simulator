import { useUi } from '../store/ui'
import { canvasApi } from '../canvas/api'

/** Fullscreen classroom view. Falls back to an in-window view when fullscreen is refused. */
export function enterPresentation() {
  const ui = useUi.getState()
  ui.select([])
  ui.setPresenting(true)
  const root = document.documentElement
  if (root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined)
  setTimeout(() => canvasApi.current?.fit(), 250)
}

export function exitPresentation() {
  useUi.getState().setPresenting(false)
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
}
