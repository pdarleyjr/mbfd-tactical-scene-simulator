import { create } from 'zustand'
import { applyScenePatch, diffBoards, isEmptyPatch, MAIN_SCENE_ID, newSceneId, scenarioKey, sceneIdSchema, withoutPendingChanges, type Board, type ClientMessage, type ScenePatch, type ServerMessage } from '@mbfd/domain'
import { setClockOffset, useBoard } from '../store/board'
import { useUi } from '../store/ui'
import { canvasApi } from '../canvas/api'

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
  send({ type: 'patch', id, patch, on: scenarioKey(board) })
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
  // The scene switched scenario while this browser was away: edits made on the old one must not land on the new one.
  const switchedAway = scenarioKey(message.board) !== scenarioKey(local)
  if (switchedAway) {
    discardOnResync = false
    inflight.clear()
    shadow = message.board
    joined = true
    if (!everJoined && message.peers > 1) useLive.setState({ arrivedToCompany: true })
    const wasJoined = everJoined
    everJoined = true
    retries = 0
    showNewBoard(message.board, local, wasJoined ? `The scene switched to ${message.board.scenario.title} while you were disconnected.` : undefined)
    useLive.setState({ connection: 'live', peers: message.peers })
    return
  }
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

/** Shows a whole new board (switch, restore, or a switch missed while away): fresh history, tools reset, map refit. */
function showNewBoard(board: Board, before: Board, message: string | undefined) {
  if (sendTimer) { clearTimeout(sendTimer); sendTimer = undefined }
  quietly(() => useBoard.getState().replaceRemote(board))
  shadow = useBoard.getState().board
  const ui = useUi.getState()
  ui.select([])
  if (scenarioKey(board) !== scenarioKey(before)) {
    ui.setTool('select')
    ui.setReviewing(false)
    ui.setCompareSnapshot(null)
    ui.showInjectBanner(null)
  }
  if (message) ui.toast(message, 'info')
  // A different map needs fitting to the screen again.
  const { world } = board.scenario
  if (world.width !== before.scenario.world.width || world.height !== before.scenario.world.height) setTimeout(() => canvasApi.current?.fit(), 80)
}

function onReplace(message: Extract<ServerMessage, { type: 'replace' }>) {
  inflight.clear()
  const title = message.board.scenario.title
  const text = message.reason !== 'switch' ? 'A saved version of the scene was restored.'
    : message.from === clientId ? `Everyone is now on ${title}. The other scenario was kept: switch back any time.`
    : `Switched to ${title} for everyone in this scene.`
  showNewBoard(message.board, useBoard.getState().board, text)
}

/** Switches everyone in this scene to another scenario. Returns false when not connected. */
export function sendScenarioSwitch(seedBoard: Board): boolean {
  if (!joined || socket?.readyState !== WebSocket.OPEN) return false
  flushLive()
  send({ type: 'switch', id: String(++messageCounter), key: scenarioKey(seedBoard), seed: seedBoard })
  return true
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
      onReplace(message)
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
