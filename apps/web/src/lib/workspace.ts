import { repairBoard, upgradeBoard, type Board } from '@mbfd/domain'
import { useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { boardFromScenario, boardFromTemplate, defaultTemplate, findTemplate } from '../templates'
import { canvasApi } from '../canvas/api'
import { buildExportFile, downloadBlob, downloadText, exportFileName, parseSceneFile } from './scene-files'
import { getStorage } from './session'
import { offerUndo } from './undo'
import { createSceneId, flushLive, goToScene, sendScenarioSwitch, isDisplayView, onLiveBoardChange, sceneIdFromPath, startLive, useLive } from './live'
import { shareBoardMedia, uploadMedia } from './media'
import { rememberScene } from './recent'

const cacheKey = (sceneId: string) => `live:${sceneId}`
const seedKey = (sceneId: string) => `seed:${sceneId}`

function restore(raw: unknown): Board | undefined {
  const templateId = raw && typeof raw === 'object' ? (raw as { templateId?: unknown }).templateId : undefined
  const template = findTemplate(typeof templateId === 'string' ? templateId : null) ?? defaultTemplate
  const restored = repairBoard(raw, template.scenario)
  if (!restored) return undefined
  // Boards saved before MBFD supplied hose loads and the map scale pick them up here.
  const background = template.scenario.background
  return upgradeBoard(restored.board, { calibration: template.scenario.calibration, templateBackground: background.kind === 'builtin' ? background.url : undefined }).board
}

/**
 * Opens the live scene named by the address. The last copy this browser saw
 * shows at once; the server's version replaces it as soon as it connects.
 */
export async function bootWorkspace() {
  const sceneId = sceneIdFromPath(location.pathname)
  const storage = await getStorage()
  const seed = restore(await storage.getMeta(seedKey(sceneId))) ?? boardFromTemplate()
  const cached = restore(await storage.getMeta(cacheKey(sceneId)))
  useBoard.getState().setBoard(cached ?? seed, { live: true })
  if (isDisplayView(location.search)) useUi.getState().setDisplay(true)
  startLive(sceneId, seed)
  let cacheTimer: ReturnType<typeof setTimeout> | undefined
  onLiveBoardChange(() => {
    if (cacheTimer) clearTimeout(cacheTimer)
    cacheTimer = setTimeout(() => {
      const { board, transientBase } = useBoard.getState()
      if (transientBase) return
      void storage.setMeta(cacheKey(sceneId), board).catch((error: unknown) => console.error('Could not cache the scene on this device', error))
      rememberScene(sceneId, board.name)
    }, 800)
  })
  useLive.subscribe((state, previous) => {
    // The server has the scene now; a one-time starting copy is no longer needed.
    if (state.connection === 'live' && previous.connection !== 'live') void storage.setMeta(seedKey(sceneId), undefined)
  })
  rememberScene(sceneId, (cached ?? seed).name)
}

/** Opens a new, separate live scene in this tab, starting from `board`. */
export async function openAsSeparateScene(board?: Board) {
  const id = createSceneId()
  if (board) {
    const storage = await getStorage()
    const shared = await shareBoardMedia(board, storage)
    if (shared.missing) useUi.getState().toast('Some media was not found on this device and must be re-attached.', 'warning')
    await storage.setMeta(seedKey(id), shared.board)
  }
  goToScene(id)
}

/**
 * Switches everyone in this scene to another scenario. Work on the current one
 * is kept on the server and comes back when anyone switches back.
 */
export function switchScenario(templateId: string) {
  const template = findTemplate(templateId)
  if (!template || useBoard.getState().board.templateId === template.id) return
  if (!sendScenarioSwitch(boardFromTemplate(template))) useUi.getState().toast('Not connected right now. Try again once the top bar shows Live.', 'warning')
}

/** Restores the original scenario objects. Undoable, and snapshots first. */
export function resetToBaseline() {
  const { board, addSnapshot, commit } = useBoard.getState()
  // Boards built on an uploaded image have no template: their original is an empty map.
  const template = findTemplate(board.templateId)
  addSnapshot(`Before reset · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
  commit(structuredClone([...(template?.objects ?? [])]), 'Reset to original scenario')
  useUi.getState().select([])
  offerUndo('Scene reset to the original. A snapshot of the work was saved.', 'success')
}

export async function exportCurrentBoard() {
  flushLive()
  const board = useBoard.getState().board
  const file = await buildExportFile(board, await getStorage())
  downloadText(exportFileName(board), JSON.stringify(file))
  useUi.getState().toast('Scene file downloaded. Import it later to open it as a separate scene.', 'success')
}

export async function exportImage() {
  const blob = await canvasApi.current?.exportPng()
  if (!blob) { useUi.getState().toast('The image could not be created.', 'error'); return }
  const board = useBoard.getState().board
  downloadBlob(exportFileName(board).replace('.mbfd-scene.json', '.png'), blob)
}

/** Imports a scene file as a new separate scene, so nobody's current work is replaced. */
export async function importSceneFile(file: File) {
  try {
    const result = await parseSceneFile(await file.text())
    const storage = await getStorage()
    for (const media of result.media) await storage.putMedia(media)
    for (const board of result.boards.slice(1)) await storage.putBoard(board)
    for (const warning of result.warnings.slice(0, 3)) useUi.getState().toast(warning, 'warning')
    const [first] = result.boards
    if (!first) { useUi.getState().toast('Nothing in that file could be imported.', 'error'); return }
    if (result.boards.length > 1) useUi.getState().toast(`The other ${result.boards.length - 1} scenes were kept under Saved on this device.`, 'info')
    await openAsSeparateScene(first)
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

async function imageSize(file: File) {
  const url = URL.createObjectURL(file)
  try { return await readImageSize(url) } finally { URL.revokeObjectURL(url) }
}

function checkImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.')
  if (file.size > 40 * 1024 * 1024) throw new Error('Images must be smaller than 40 MB.')
}

/** Starts a brand-new separate scene on an operator-supplied aerial image. */
export async function newScenarioFromImage(file: File, title: string) {
  checkImage(file)
  const size = await imageSize(file)
  const background = await uploadMedia(file, file.name)
  const base = defaultTemplate.scenario
  const board = boardFromScenario({
    ...base,
    title: title.trim() || file.name.replace(/\.[^.]+$/, ''),
    description: '',
    dispatch: '',
    background,
    world: size,
    injects: [],
  }, [], {})
  delete board.scenario.video
  delete board.scenario.poster
  delete board.scenario.calibration
  await openAsSeparateScene(board)
}

export async function replaceBackground(file: File) {
  checkImage(file)
  const size = await imageSize(file)
  const background = await uploadMedia(file, file.name)
  useBoard.getState().updateScenario((scenario) => {
    const { calibration: _dropped, ...rest } = scenario
    return { ...rest, background, world: size }
  })
  useUi.getState().toast('Map replaced. The old calibration was cleared, so calibrate again.', 'warning')
}

export async function attachVideo(file: File) {
  if (!['video/mp4', 'video/webm'].includes(file.type)) throw new Error('Choose an MP4 or WebM video.')
  if (file.size > 95 * 1024 * 1024) throw new Error('Videos must be smaller than 95 MB.')
  const video = await uploadMedia(file, file.name)
  useBoard.getState().updateScenario((scenario) => {
    const { poster: _poster, ...rest } = scenario
    return { ...rest, video }
  })
}

/** Boards saved in this browser before scenes were shared. */
export async function listDeviceBoards() {
  return (await getStorage()).listBoards()
}

export async function openDeviceBoard(id: string) {
  const record = await (await getStorage()).getBoard(id)
  const board = record ? restore(record.board) : undefined
  if (!board) { useUi.getState().toast('That scene could not be opened.', 'error'); return }
  await openAsSeparateScene(board)
}

export async function deleteDeviceBoard(id: string) {
  const storage = await getStorage()
  const record = await storage.getBoard(id)
  if (!record) return
  await storage.deleteBoard(id)
  useUi.getState().toast(`Removed “${record.board.name}” from this device.`, 'info', {
    label: 'Undo',
    run: () => { void storage.putBoard(record.board, record.thumbnail).then(() => useUi.getState().toast('Scene restored.', 'success')) },
  })
}

export interface ServerSnapshot {
  name: string
  savedAt: string
  version: number
  reason: string
  objectCount: number
  title?: string
}

/** Automatic snapshots the server keeps for this scene, newest first. */
export async function listServerSnapshots(sceneId: string): Promise<ServerSnapshot[]> {
  const response = await fetch(`/sync-api/scenes/${sceneId}/history`)
  if (!response.ok) throw new Error('Saved versions could not be loaded.')
  return ((await response.json()) as { items: ServerSnapshot[] }).items
}

/** Puts a saved version back for everyone. The current state is snapshotted first. */
export async function restoreServerSnapshot(sceneId: string, name: string) {
  flushLive()
  const response = await fetch(`/sync-api/scenes/${sceneId}/history/${encodeURIComponent(name)}/restore`, { method: 'POST' })
  if (!response.ok) throw new Error('That version could not be restored.')
  useUi.getState().toast('Saved version restored for everyone. The previous state was kept as a snapshot.', 'success')
}
