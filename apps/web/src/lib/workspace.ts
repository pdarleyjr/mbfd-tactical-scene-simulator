import { create } from 'zustand'
import { repairBoard, type Board } from '@mbfd/domain'
import { useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { boardFromScenario, boardFromTemplate, defaultTemplate, findTemplate } from '../templates'
import { canvasApi } from '../canvas/api'
import { buildExportFile, downloadBlob, downloadText, exportFileName, parseSceneFile } from './scene-files'
import { getStorage } from './session'
import { requestPersistentStorage } from './storage'
import { offerUndo } from './undo'

export interface SaveStatus {
  state: 'idle' | 'saving' | 'saved' | 'error'
  at: number | null
  durable: boolean
  persisted: boolean
  message?: string | undefined
}

export const useSaveStatus = create<SaveStatus>(() => ({ state: 'idle', at: null, durable: true, persisted: false }))

const LAST_BOARD_KEY = 'lastBoardId'
const tabId = crypto.randomUUID()
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('mbfd-tactical-scene-simulator') : null

function restore(raw: unknown): { board: Board; repaired: boolean } | undefined {
  const templateId = raw && typeof raw === 'object' ? (raw as { templateId?: unknown }).templateId : undefined
  const template = findTemplate(typeof templateId === 'string' ? templateId : null) ?? defaultTemplate
  return repairBoard(raw, template.scenario)
}

/** Keeps an untouched copy of a record before a repaired version replaces it. */
async function backUpDamaged(raw: unknown, id: string) {
  try { await (await getStorage()).setMeta(`damaged-backup:${id}`, raw) } catch (error) { console.error('Could not keep a backup of the damaged scene', error) }
}

function resetUiForBoard() {
  const ui = useUi.getState()
  ui.select([])
  ui.setTool('select')
  ui.setReviewing(false)
  ui.setCompareSnapshot(null)
  ui.showInjectBanner(null)
  ui.setOtherTabChanged(false)
}

export async function bootWorkspace() {
  const storage = await getStorage()
  useSaveStatus.setState({ durable: storage.durable })
  void requestPersistentStorage().then((persisted) => useSaveStatus.setState({ persisted }))
  const lastId = await storage.getMeta<string>(LAST_BOARD_KEY)
  let record = lastId ? await storage.getBoard(lastId) : undefined
  if (!record) {
    const [latest] = await storage.listBoards()
    if (latest) record = await storage.getBoard(latest.id)
  }
  if (record) {
    const restored = restore(record.board)
    if (restored) {
      useBoard.getState().setBoard(restored.board)
      if (restored.repaired) {
        await backUpDamaged(record.board, restored.board.id)
        useUi.getState().toast('Part of the saved scene could not be read. Everything recoverable was restored, and the original was kept as a backup.', 'warning')
      }
      await storage.setMeta(LAST_BOARD_KEY, restored.board.id)
      startAutosave()
      return
    }
  }
  const board = useBoard.getState().board
  await storage.putBoard(board)
  await storage.setMeta(LAST_BOARD_KEY, board.id)
  useBoard.getState().setBoard(board)
  startAutosave()
}

let autosaveStarted = false
let pending: ReturnType<typeof setTimeout> | undefined
let lastSaved: Board | undefined

async function saveNow() {
  pending = undefined
  const { board, transientBase, hydrated } = useBoard.getState()
  if (!hydrated || transientBase || board === lastSaved) return
  useSaveStatus.setState({ state: 'saving' })
  try {
    const storage = await getStorage()
    await storage.putBoard(board)
    lastSaved = board
    useSaveStatus.setState({ state: 'saved', at: Date.now(), message: undefined })
    channel?.postMessage({ type: 'saved', boardId: board.id, tabId })
  } catch (error) {
    console.error('Autosave failed', error)
    useSaveStatus.setState({ state: 'error', message: error instanceof Error ? error.message : 'Could not save.' })
  }
}

export function flushSave() {
  if (pending) clearTimeout(pending)
  return saveNow()
}

/** Commits a half-typed field (labels and notes commit on blur) before saving. */
function flushOnHide() {
  const active = document.activeElement
  if (active instanceof HTMLElement && active !== document.body) active.blur()
  // Stamp the save time so a running clock resumes from here after a reload.
  if (useBoard.getState().board.training.timer.running) useBoard.getState().updateTraining((training) => training)
  void flushSave()
}

function startAutosave() {
  if (autosaveStarted) return
  autosaveStarted = true
  lastSaved = useBoard.getState().board
  useSaveStatus.setState({ state: 'saved', at: Date.now() })
  useBoard.subscribe((state, previous) => {
    if (state.board === previous.board && state.transientBase === previous.transientBase) return
    if (state.transientBase) return
    if (pending) clearTimeout(pending)
    pending = setTimeout(() => { void saveNow() }, 450)
  })
  addEventListener('pagehide', flushOnHide)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushOnHide() })
  channel?.addEventListener('message', (event: MessageEvent<{ type: string; boardId: string; tabId: string }>) => {
    if (event.data?.type === 'saved' && event.data.tabId !== tabId && event.data.boardId === useBoard.getState().board.id) useUi.getState().setOtherTabChanged(true)
  })
}

export async function captureThumbnail() {
  const boardId = useBoard.getState().board.id
  const thumbnail = canvasApi.current?.thumbnail()
  if (!thumbnail) return
  const storage = await getStorage()
  await flushSave()
  await storage.setThumbnail(boardId, thumbnail)
}

export async function openBoard(id: string, options: { discardUnsaved?: boolean } = {}) {
  if (pending) clearTimeout(pending)
  if (!options.discardUnsaved) { await captureThumbnail(); await flushSave() }
  const storage = await getStorage()
  const record = await storage.getBoard(id)
  const restored = record ? restore(record.board) : undefined
  if (!restored) { useUi.getState().toast('That scene could not be opened.', 'error'); return }
  if (restored.repaired) {
    await backUpDamaged(record!.board, restored.board.id)
    useUi.getState().toast('Part of that scene could not be read. Everything recoverable was restored, and the original was kept as a backup.', 'warning')
  }
  resetUiForBoard()
  useBoard.getState().setBoard(restored.board)
  lastSaved = restored.board
  await storage.setMeta(LAST_BOARD_KEY, id)
}

async function adopt(board: Board, message: string, options: { skipSave?: boolean } = {}) {
  if (pending) clearTimeout(pending)
  if (!options.skipSave) { await captureThumbnail(); await flushSave() }
  const storage = await getStorage()
  await storage.putBoard(board)
  await storage.setMeta(LAST_BOARD_KEY, board.id)
  resetUiForBoard()
  useBoard.getState().setBoard(board)
  lastSaved = board
  useUi.getState().toast(message, 'success')
}

export function newBoardFromTemplate(templateId = defaultTemplate.id) {
  const template = findTemplate(templateId) ?? defaultTemplate
  return adopt(boardFromTemplate(template, `${template.scenario.title}`), 'New board created from the original scenario.')
}

export async function duplicateBoard(id: string) {
  const storage = await getStorage()
  await flushSave()
  const record = await storage.getBoard(id)
  if (!record) return
  const now = new Date().toISOString()
  const copy: Board = { ...structuredClone(record.board), id: crypto.randomUUID(), name: `${record.board.name} (copy)`.slice(0, 120), createdAt: now, updatedAt: now }
  await storage.putBoard(copy, record.thumbnail)
  useUi.getState().toast(`Duplicated “${record.board.name}”.`, 'success')
}

export async function renameBoard(id: string, name: string) {
  const trimmed = name.trim().slice(0, 120)
  if (!trimmed) return
  if (id === useBoard.getState().board.id) { useBoard.getState().renameBoard(trimmed); await flushSave(); return }
  const storage = await getStorage()
  const record = await storage.getBoard(id)
  if (record) await storage.putBoard({ ...record.board, name: trimmed, updatedAt: new Date().toISOString() }, record.thumbnail)
}

export async function deleteBoard(id: string) {
  const storage = await getStorage()
  const record = await storage.getBoard(id)
  if (!record) return
  const deletingCurrent = id === useBoard.getState().board.id
  // Stop any pending autosave first so it cannot write the deleted board back.
  if (deletingCurrent && pending) clearTimeout(pending)
  await storage.deleteBoard(id)
  if (deletingCurrent) {
    const [next] = await storage.listBoards()
    if (next) await openBoard(next.id, { discardUnsaved: true })
    else await adopt(boardFromTemplate(), 'Started a fresh board from the original scenario.', { skipSave: true })
  }
  useUi.getState().toast(`Deleted “${record.board.name}”.`, 'info', {
    label: 'Undo',
    run: () => { void storage.putBoard(record.board, record.thumbnail).then(() => useUi.getState().toast('Scene restored.', 'success')) },
  })
}

/** Restores the original scenario objects. Undoable, and snapshots first. */
export function resetToBaseline() {
  const { board, addSnapshot, commit } = useBoard.getState()
  // Boards built on an uploaded image have no template: their original is an empty map.
  const template = findTemplate(board.templateId)
  addSnapshot(`Before reset · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
  commit(structuredClone([...(template?.objects ?? [])]), 'Reset to original scenario')
  useUi.getState().select([])
  offerUndo('Scene reset to the original. A snapshot of your work was saved.', 'success')
}

export async function exportCurrentBoard() {
  await flushSave()
  const board = useBoard.getState().board
  const file = await buildExportFile(board, await getStorage())
  downloadText(exportFileName(board), JSON.stringify(file))
  useUi.getState().toast('Scene file downloaded. Open it on any device with Import.', 'success')
}

export async function exportImage() {
  const blob = await canvasApi.current?.exportPng()
  if (!blob) { useUi.getState().toast('The image could not be created.', 'error'); return }
  const board = useBoard.getState().board
  downloadBlob(exportFileName(board).replace('.mbfd-scene.json', '.png'), blob)
}

export async function importSceneFile(file: File) {
  try {
    const result = await parseSceneFile(await file.text())
    const storage = await getStorage()
    for (const media of result.media) await storage.putMedia(media)
    for (const board of result.boards.slice(1)) await storage.putBoard(board)
    const [first] = result.boards
    if (first) await adopt(first, result.boards.length > 1 ? `Imported ${result.boards.length} scenes.` : `Imported “${first.name}”.`)
    else useUi.getState().toast('Nothing in that file could be imported.', 'error')
    for (const warning of result.warnings.slice(0, 3)) useUi.getState().toast(warning, 'warning')
  } catch (error) {
    useUi.getState().toast(error instanceof Error ? error.message : 'That file could not be imported.', 'error')
  }
}

function readImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => reject(new Error('That image could not be read.'))
    image.src = url
  })
}

/** Starts a brand-new scenario on an operator-supplied aerial image. */
export async function newScenarioFromImage(file: File, title: string) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPEG, or WebP image.')
  if (file.size > 40 * 1024 * 1024) throw new Error('Images must be smaller than 40 MB.')
  const url = URL.createObjectURL(file)
  try {
    const size = await readImageSize(url)
    const blobId = crypto.randomUUID()
    const storage = await getStorage()
    await storage.putMedia({ id: blobId, blob: file, mimeType: file.type, name: file.name })
    const base = defaultTemplate.scenario
    const board = boardFromScenario({
      ...base,
      title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
      description: '',
      dispatch: '',
      background: { kind: 'blob', blobId, mimeType: file.type, name: file.name },
      world: size,
      injects: [],
    }, [], {})
    delete board.scenario.video
    delete board.scenario.poster
    delete board.scenario.calibration
    await adopt(board, 'New scenario created. Calibrate the map before measuring distances.')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function replaceBackground(file: File) {
  if (!file.type.startsWith('image/')) throw new Error('Choose a PNG, JPEG, or WebP image.')
  const url = URL.createObjectURL(file)
  try {
    const size = await readImageSize(url)
    const blobId = crypto.randomUUID()
    await (await getStorage()).putMedia({ id: blobId, blob: file, mimeType: file.type, name: file.name })
    useBoard.getState().updateScenario((scenario) => {
      const { calibration: _dropped, ...rest } = scenario
      return { ...rest, background: { kind: 'blob', blobId, mimeType: file.type, name: file.name }, world: size }
    })
    useUi.getState().toast('Map replaced. The old calibration was cleared, so calibrate again.', 'warning')
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function attachVideo(file: File) {
  if (!file.type.startsWith('video/')) throw new Error('Choose an MP4 or WebM video.')
  const blobId = crypto.randomUUID()
  await (await getStorage()).putMedia({ id: blobId, blob: file, mimeType: file.type, name: file.name })
  useBoard.getState().updateScenario((scenario) => {
    const { poster: _poster, ...rest } = scenario
    return { ...rest, video: { kind: 'blob', blobId, mimeType: file.type, name: file.name } }
  })
}

export async function listBoards() {
  return (await getStorage()).listBoards()
}

export function reloadFromStorage() {
  return openBoard(useBoard.getState().board.id, { discardUnsaved: true })
}
