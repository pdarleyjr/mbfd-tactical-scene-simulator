import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_FIRE_LAYOUTS } from '@mbfd/domain'
import { boardFromTemplate } from '../templates'
import { useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { deleteFireLayout, saveFireLayout } from './commands'

function layouts() {
  return useBoard.getState().board.scenario.fireLayouts ?? []
}

function lastToast() {
  const toasts = useUi.getState().toasts
  return toasts[toasts.length - 1]
}

beforeEach(() => {
  useBoard.getState().setBoard(boardFromTemplate())
})

describe('deleting a fire layout', () => {
  it('Undo puts the layout back where it was', () => {
    const first = saveFireLayout('First')!
    saveFireLayout('Second')
    deleteFireLayout(first.id)
    expect(layouts().map((layout) => layout.name)).toEqual(['Second'])

    lastToast()!.action!.run()

    expect(layouts().map((layout) => layout.name)).toEqual(['First', 'Second'])
  })

  it('Undo never pushes a scenario past the layout limit the server accepts', () => {
    for (let index = 0; index < MAX_FIRE_LAYOUTS; index += 1) saveFireLayout(`Layout ${index + 1}`)
    deleteFireLayout(layouts()[0]!.id)
    const undo = lastToast()!.action!
    saveFireLayout('Replacement')
    expect(layouts()).toHaveLength(MAX_FIRE_LAYOUTS)

    undo.run()

    expect(layouts()).toHaveLength(MAX_FIRE_LAYOUTS)
    expect(lastToast()!.tone).toBe('warning')
  })

  it('Undo does not restore a layout into a different scenario', () => {
    const layout = saveFireLayout('Waterfront fire')!
    deleteFireLayout(layout.id)
    const undo = lastToast()!.action!
    useBoard.getState().setBoard({ ...boardFromTemplate(), templateId: 'another-scenario' })

    undo.run()

    expect(layouts()).toEqual([])
    expect(lastToast()!.tone).toBe('warning')
  })
})
