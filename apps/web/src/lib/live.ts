import { create } from 'zustand'
import { applyScenePatch, diffBoards, isEmptyPatch, MAIN_SCENE_ID, newSceneId, sceneIdSchema, withoutPendingChanges, type Board, type ClientMessage, type ScenePatch, type ServerMessage } from '@mbfd/domain'
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
const PING_EVERY_MS = 20_000
const SILENCE_LIMIT_MS = 60_000

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
/** The scene as the server will have it once everything this browser sent is applied. */
let shadow: Board | undefined
/** Sent but not yet acknowledged, oldest first. Re-sent after a reconnect. */
const inflight = new Map<string, ScenePatch>()
let joined = false
let everJoined = false
/** The server refused a change: reload its state and drop local edits not yet applied there. */
let discardOnResync = false
let applyingRemote = false
let sendTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let retries = 0
let messageCounter = 0
let lastHeardAt = Date.now()
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
  if (isEmptyPatch(patch)) return
  const id = String(++messageCounter)
  inflight.set(id, patch)
  send({ type: 'patch', id, patch })
}

function scheduleSend() {
  if (sendTimer || !joined) return
  sendTimer = setTimeout(flushLive, useBoard.getState().transientBase ? DRAG_SEND_DELAY_MS : SEND_DELAY_MS)
}

function quietly(run: () => void) {
  applyingRemote = true
  try { run() } finally { applyingRemote = false }
  changeListeners.forEach((listener) => listener())
}

/** An inject someone else revealed shows on every screen, the classroom display included. */
function announceNewInjects(before: Board, after: Board) {
  const fresh = Object.keys(after.training.revealed).filter((id) => !(id in before.training.revealed))
  const latest = fresh.sort((a, b) => after.training.revealed[b]! - after.training.revealed[a]!)[0]
  if (latest) useUi.getState().showInjectBanner(latest)
}

/** Drops the connection and opens a new one right away. */
function resync() {
  const held = socket
  socket = undefined
  joined = false
  held?.close()
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = setTimeout(connect, 50)
}

function onState(message: Extract<ServerMessage, { type: 'state' }>) {
  setClockOffset(message.now - Date.now())
  // Changes the server never confirmed, and edits made while disconnected, go back on top of its state.
  const local = useBoard.getState().board
  const pending = discardOnResync ? [] : [...inflight.values(), shadow ? diffBoards(shadow, local) : {}].filter((patch) => !isEmptyPatch(patch))
  const merged = pending.reduce((board, patch) => applyScenePatch(board, patch), message.board)
  if (discardOnResync) useUi.getState().toast('Some changes could not be saved, so the scene was reloaded from the server.', 'warning')
  discardOnResync = false
  inflight.clear()
  quietly(() => useBoard.getState().replaceRemote(merged, { keepHistory: everJoined }))
  shadow = message.board
  joined = true
  if (!everJoined && message.peers > 1) useLive.setState({ arrivedToCompany: true })
  everJoined = true
  retries = 0
  flushLive()
  useLive.setState({ connection: 'live', peers: message.peers })
}

function onRemotePatch(patch: ScenePatch) {
  if (!shadow) return
  // Local changes the server has not applied yet will land after this one there, so they win here too.
  const unsent = diffBoards(shadow, useBoard.getState().board)
  const remote = withoutPendingChanges(patch, [...inflight.values(), unsent])
  if (isEmptyPatch(remote)) return
  const before = useBoard.getState().board
  quietly(() => useBoard.getState().applyRemote(remote))
  shadow = applyScenePatch(shadow, remote)
  if (remote.training) announceNewInjects(before, useBoard.getState().board)
}

function handle(message: ServerMessage) {
  lastHeardAt = Date.now()
  switch (message.type) {
    case 'state':
      onState(message)
      return
    case 'patch':
      onRemotePatch(message.patch)
      return
    case 'replace':
      if (sendTimer) { clearTimeout(sendTimer); sendTimer = undefined }
      inflight.clear()
      quietly(() => useBoard.getState().replaceRemote(message.board))
      shadow = useBoard.getState().board
      useUi.getState().select([])
      useUi.getState().toast('A saved version of the scene was restored.', 'info')
      return
    case 'ack':
      inflight.delete(message.id)
      return
    case 'presence':
      useLive.setState({ peers: message.peers })
      return
    case 'pong':
      setClockOffset(message.now - Date.now())
      return
    case 'error':
      useUi.getState().toast(message.message, 'warning')
      if (message.id && inflight.has(message.id)) { discardOnResync = true; resync() }
      else if (!joined) socket?.close()
      return
  }
}

function connect() {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${protocol}://${location.host}/sync/${sceneId}`)
  socket = ws
  ws.addEventListener('open', () => {
    lastHeardAt = Date.now()
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
  setInterval(() => {
    if (!joined) return
    // A connection that has gone silent (sleeping laptop, dead Wi-Fi) is replaced.
    if (Date.now() - lastHeardAt > SILENCE_LIMIT_MS) { resync(); return }
    send({ type: 'ping' })
  }, PING_EVERY_MS)
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
