import { create } from 'zustand'
import { applyScenePatch, diffBoards, isEmptyPatch, MAIN_SCENE_ID, newSceneId, sceneIdSchema, type Board, type ClientMessage, type ScenePatch, type ServerMessage } from '@mbfd/domain'
import { setClockOffset, useBoard } from '../store/board'
import { useUi } from '../store/ui'

/**
 * Live shared scenes. Everyone who opens the same link works on one scene:
 * changes go to the sync service as small patches and arrive from others the
 * same way. While the connection is down, edits keep working locally and
 * merge back in when it returns.
 */

export type LiveConnection = 'connecting' | 'live' | 'reconnecting'

interface LiveStore {
  sceneId: string
  connection: LiveConnection
  /** People connected to this scene, including this browser. */
  peers: number
  /** Others were already here when this browser arrived. */
  arrivedToCompany: boolean
  setArrivalNoticeSeen(): void
}

export const useLive = create<LiveStore>()((set) => ({
  sceneId: MAIN_SCENE_ID,
  connection: 'connecting',
  peers: 1,
  arrivedToCompany: false,
  setArrivalNoticeSeen() { set({ arrivedToCompany: false }) },
}))

const SEND_DELAY_MS = 30
const DRAG_SEND_DELAY_MS = 90
const MAX_RETRY_MS = 15_000

/** The scene named by the address: `/` is the main scene, `/s/<id>` a separate one. */
export function sceneIdFromPath(pathname: string): string {
  const match = /^\/s\/([^/]+)\/?$/.exec(pathname)
  const candidate = match?.[1]?.toLowerCase()
  return candidate && sceneIdSchema.safeParse(candidate).success ? candidate : MAIN_SCENE_ID
}

export function isDisplayView(search: string): boolean {
  return new URLSearchParams(search).get('view') === 'present'
}

export function scenePath(sceneId: string): string {
  return sceneId === MAIN_SCENE_ID ? '/' : `/s/${sceneId}`
}

export function sceneLink(sceneId: string, options: { display?: boolean } = {}): string {
  return `${location.origin}${scenePath(sceneId)}${options.display ? '?view=present' : ''}`
}

export function createSceneId(): string {
  const bytes = crypto.getRandomValues(new Uint32Array(8))
  let index = 0
  return newSceneId(() => bytes[index++]! / 2 ** 32)
}

const clientId = crypto.randomUUID()
let sceneId = MAIN_SCENE_ID
let seed: Board | undefined
let socket: WebSocket | undefined
/** The scene as the server has it, including everything this browser has sent. */
let shadow: Board | undefined
let joined = false
let everJoined = false
let applyingRemote = false
let sendTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let retries = 0
let messageCounter = 0
const changeListeners = new Set<() => void>()

/** Called after any change to the live board, local or remote. */
export function onLiveBoardChange(listener: () => void) {
  changeListeners.add(listener)
  return () => { changeListeners.delete(listener) }
}

function send(message: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
}

/** Sends whatever changed since the last send. Safe to call any time. */
export function flushLive() {
  if (sendTimer) { clearTimeout(sendTimer); sendTimer = undefined }
  if (!joined || !shadow || socket?.readyState !== WebSocket.OPEN) return
  const board = useBoard.getState().board
  const patch = diffBoards(shadow, board)
  shadow = board
  if (!isEmptyPatch(patch)) send({ type: 'patch', id: String(++messageCounter), patch })
}

function scheduleSend() {
  if (sendTimer || !joined) return
  sendTimer = setTimeout(flushLive, useBoard.getState().transientBase ? DRAG_SEND_DELAY_MS : SEND_DELAY_MS)
}

function applyRemote(run: () => void) {
  applyingRemote = true
  try { run() } finally { applyingRemote = false }
  shadow = useBoard.getState().board
  changeListeners.forEach((listener) => listener())
}

/** An inject someone else revealed shows on every screen, the classroom display included. */
function announceNewInjects(before: Board, after: Board) {
  const fresh = Object.keys(after.training.revealed).filter((id) => !(id in before.training.revealed))
  const latest = fresh.sort((a, b) => after.training.revealed[b]! - after.training.revealed[a]!)[0]
  if (latest) useUi.getState().showInjectBanner(latest)
}

function handle(message: ServerMessage) {
  switch (message.type) {
    case 'state': {
      setClockOffset(message.now - Date.now())
      // Edits made while disconnected (or before the first connection) are re-applied on top.
      const local = useBoard.getState().board
      const pending: ScenePatch = shadow ? diffBoards(shadow, local) : {}
      const reconnecting = everJoined
      applyRemote(() => useBoard.getState().replaceRemote(message.board, { keepHistory: reconnecting }))
      shadow = message.board
      joined = true
      everJoined = true
      retries = 0
      if (!isEmptyPatch(pending)) {
        const { board } = useBoard.getState()
        applyingRemote = true
        try { useBoard.getState().replaceRemote(applyScenePatch(board, pending), { keepHistory: true }) } finally { applyingRemote = false }
      }
      flushLive()
      if (!reconnecting && message.peers > 1) useLive.setState({ arrivedToCompany: true })
      useLive.setState({ connection: 'live', peers: message.peers })
      return
    }
    case 'patch': {
      flushLive()
      const before = useBoard.getState().board
      applyRemote(() => useBoard.getState().applyRemote(message.patch))
      if (message.patch.training) announceNewInjects(before, useBoard.getState().board)
      return
    }
    case 'replace': {
      flushLive()
      applyRemote(() => useBoard.getState().replaceRemote(message.board))
      useUi.getState().select([])
      if (message.from !== clientId) useUi.getState().toast('The scene was replaced with a saved version.', 'info')
      return
    }
    case 'presence':
      useLive.setState({ peers: message.peers })
      return
    case 'pong':
      setClockOffset(message.now - Date.now())
      return
    case 'error':
      useUi.getState().toast(message.message, 'warning')
      return
    case 'ack':
      return
  }
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${location.host}/sync/${sceneId}`)
  socket = ws
  ws.addEventListener('open', () => {
    send({ type: 'hello', clientId, seed: seed ?? useBoard.getState().board })
  })
  ws.addEventListener('message', (event: MessageEvent<string>) => {
    try { handle(JSON.parse(event.data) as ServerMessage) } catch (error) { console.error('Live update failed', error) }
  })
  ws.addEventListener('close', () => {
    if (socket !== ws) return
    joined = false
    useLive.setState({ connection: everJoined ? 'reconnecting' : 'connecting' })
    const delay = Math.min(MAX_RETRY_MS, 600 * 2 ** retries) * (0.75 + Math.random() * 0.5)
    retries += 1
    retryTimer = setTimeout(connect, delay)
  })
}

/** Starts working on a live scene. `seedBoard` is what a brand-new scene starts as. */
export function startLive(id: string, seedBoard: Board) {
  sceneId = id
  seed = seedBoard
  // Whatever is on screen now is the starting point: edits made before the first connection are sent once it opens.
  shadow = useBoard.getState().board
  useLive.setState({ sceneId: id, connection: 'connecting' })
  useBoard.subscribe((state, previous) => {
    if (applyingRemote || state.board === previous.board) return
    changeListeners.forEach((listener) => listener())
    scheduleSend()
  })
  addEventListener('online', () => { if (!joined) reconnectNow() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !joined) reconnectNow() })
  addEventListener('pagehide', () => flushLive())
  setInterval(() => { if (joined) send({ type: 'ping' }) }, 25_000)
  connect()
}

function reconnectNow() {
  if (socket && socket.readyState <= WebSocket.OPEN) return
  if (retryTimer) clearTimeout(retryTimer)
  retries = 0
  connect()
}

/** Test hook: drops the connection and keeps it down for a while, like a dead Wi-Fi spot. */
export function dropConnectionForTests(holdMs: number) {
  if (retryTimer) clearTimeout(retryTimer)
  const held = socket
  socket = undefined
  joined = false
  useLive.setState({ connection: 'reconnecting' })
  held?.close()
  retryTimer = setTimeout(connect, holdMs)
}

/** Loads a different scene in this tab. */
export function goToScene(id: string, options: { display?: boolean } = {}) {
  flushLive()
  location.assign(`${scenePath(id)}${options.display ? '?view=present' : ''}`)
}
