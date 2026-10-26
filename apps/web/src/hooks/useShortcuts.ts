import { useEffect } from 'react'
import { useBoard } from '../store/board'
import { useUi, type Tool } from '../store/ui'
import { canvasApi } from '../canvas/api'
import { cancelDraft, finishDraft, undoDraftPoint } from '../canvas/drafting'
import { copySelection, deleteSelection, duplicateSelection, nudgeSelection, pasteClipboard, rotateSelection, selectAll, toggleLockSelection } from '../lib/commands'
import { enterPresentation, exitPresentation } from '../lib/presentation'

const toolKeys: Record<string, Tool> = { v: 'select', a: 'apparatus', h: 'hose', y: 'hydrant', m: 'marker', t: 'note', d: 'arrow', r: 'measure' }

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

export function useShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || document.querySelector('dialog[open]')) return
      const ui = useUi.getState()
      const board = useBoard.getState()
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()

      // Replay shows a past scene; editing shortcuts would change the live board unseen.
      if (ui.reviewing) { if (key === 'escape') ui.setReviewing(false); return }
      // The classroom display is view-only: fit and fullscreen, nothing else.
      if (ui.display) { if (key === 'f') canvasApi.current?.fit(); return }
      if (mod && key === 'z') { event.preventDefault(); if (event.shiftKey) board.redo(); else board.undo(); return }
      if (mod && key === 'y') { event.preventDefault(); board.redo(); return }
      // A focused button handles its own Enter and Space.
      if ((key === 'enter' || key === ' ') && event.target instanceof HTMLButtonElement) return
      if (mod && key === 'd') { event.preventDefault(); duplicateSelection(); return }
      if (mod && key === 'c') { copySelection(); return }
      if (mod && key === 'v') { event.preventDefault(); pasteClipboard(); return }
      if (mod && key === 'a') { event.preventDefault(); selectAll(); return }
      if (mod) return

      if (key === 'escape') {
        if (ui.draft) {
          const added = ui.draft.points.length - (ui.draft.basePointCount ?? 0)
          if (ui.tool === 'hose' && ui.draft.points.length > 2 && added > 0) finishDraft()
          else cancelDraft()
          return
        }
        if (ui.bannerInjectId) { ui.showInjectBanner(null); return }
        if (ui.selection.length) { ui.select([]); return }
        if (ui.tool !== 'select') { ui.setTool('select'); return }
        if (ui.presenting) exitPresentation()
        return
      }
      if (key === 'enter' && ui.draft) { event.preventDefault(); finishDraft(); return }
      if ((key === 'backspace' || key === 'delete') && ui.draft) { event.preventDefault(); undoDraftPoint(); return }
      if ((key === 'backspace' || key === 'delete') && ui.selection.length) { event.preventDefault(); deleteSelection(); return }
      if (key.startsWith('arrow') && ui.selection.length) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        nudgeSelection(key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0, key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0)
        return
      }
      if (event.key === '[' || event.key === '{') { rotateSelectionOrGhost(event.shiftKey ? -1 : -15); return }
      if (event.key === ']' || event.key === '}') { rotateSelectionOrGhost(event.shiftKey ? 1 : 15); return }
      if (key === 'l' && ui.selection.length) { toggleLockSelection(); return }
      if (key === 'f') { canvasApi.current?.fit(); return }
      if (key === 'p') { if (ui.presenting) exitPresentation(); else enterPresentation(); return }
      if (key === '?') { ui.openDialog('shortcuts'); return }
      if (key === 'c' && !ui.presenting) { ui.setTool('calibrate'); return }
      const tool = toolKeys[key]
      if (tool && !ui.presenting) ui.setTool(tool)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** With a vehicle armed for placement, [ and ] turn the placement preview. */
function rotateSelectionOrGhost(delta: number) {
  const ui = useUi.getState()
  if (ui.tool === 'apparatus' && ui.apparatusTemplate) {
    const current = ui.lastRotation[ui.apparatusTemplate] ?? 0
    ui.rememberRotation(ui.apparatusTemplate, (((current + delta) % 360) + 360) % 360)
    return
  }
  rotateSelection(delta)
}
