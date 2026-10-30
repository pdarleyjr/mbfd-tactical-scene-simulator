import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { clientMessageSchema, hostKeySchema, scenarioKey, sceneIdSchema, type RoomAccess, type ServerMessage } from '@mbfd/domain'
import { SceneFiles } from './files.js'
import { MediaStore, json } from './media.js'
import { RoomManager, defaultTiming, type Peer, type Room, type RoomTiming } from './rooms.js'
import { RoomRegistry, defaultRetention, denialText, type Retention, type RoomMeta, type StoredKind } from './access.js'

export interface SyncOptions {
  dataDir: string
  timing?: RoomTiming
  maxPeersPerRoom?: number
  maxConnectionsPerAddress?: number
  maxMediaBytes?: number
  /** How long unused rooms live; see access.ts. */
  retention?: Retention
  /** Most scenes the server stores. New rooms are refused beyond this. */
  maxScenes?: number
  /** Rooms one address may start per hour. */
  maxCreatesPerHour?: number
  /** How often the expiry sweep runs. */
  lifecycleEveryMs?: number
}

const MESSAGES_PER_SECOND = 80
const BYTES_PER_SECOND = 16 * 1024 * 1024
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024
const RESTORE_INTERVAL_MS = 10_000
const SWITCH_INTERVAL_MS = 2_000
const JSON_BODY_LIMIT = 4096

/** The visitor's address as Cloudflare and Caddy report it, for per-address limits. */
function clientAddress(request: IncomingMessage): string {
  const header = request.headers['cf-connecting-ip'] ?? request.headers['x-forwarded-for']
  const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim()
  return first || request.socket.remoteAddress || 'unknown'
}

/** A small JSON request body, or undefined when it is too large or not JSON. */
async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > JSON_BODY_LIMIT) return undefined
    chunks.push(chunk as Buffer)
  }
  try {
    const parsed: unknown = size ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

const HOST_ACTIONS = ['lock', 'unlock', 'end', 'reopen', 'share'] as const
type HostAction = (typeof HOST_ACTIONS)[number]

export function createSyncServer(options: SyncOptions) {
  const files = new SceneFiles(options.dataDir)
  const maxScenes = options.maxScenes ?? 1000
  const rooms = new RoomManager(files, options.timing ?? defaultTiming, maxScenes)
  const registry = new RoomRegistry(files, options.retention ?? defaultRetention)
  const media = new MediaStore(path.join(options.dataDir, 'media'), options.maxMediaBytes ?? 8 * 1024 * 1024 * 1024)
  const maxPeers = options.maxPeersPerRoom ?? 150
  const maxPerAddress = options.maxConnectionsPerAddress ?? 40
  const maxCreatesPerHour = options.maxCreatesPerHour ?? 120
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
  const connectionsByAddress = new Map<string, number>()
  const createsByAddress = new Map<string, number[]>()
  const lastRestore = new Map<string, number>()
  const lastSwitch = new Map<string, number>()

  /** Starting rooms is cheap but not free: each address gets a generous hourly allowance. */
  function mayCreate(address: string, now = Date.now()): boolean {
    const recent = (createsByAddress.get(address) ?? []).filter((at) => now - at < 3_600_000)
    if (recent.length >= maxCreatesPerHour) { createsByAddress.set(address, recent); return false }
    createsByAddress.set(address, [...recent, now])
    return true
  }

  /** Whether the caller may change a room over HTTP (restore a version). Solo and locked rooms need the host key. */
  async function mayEdit(id: string, request: IncomingMessage): Promise<boolean> {
    const meta = await registry.get(id)
    if (!meta) return true
    if (meta.status === 'ended') return false
    const header = request.headers['x-host-key']
    const key = Array.isArray(header) ? header[0] : header
    const host = hostKeySchema.safeParse(key).success && registry.verifyHost(meta, key)
    return host || (meta.kind === 'shared' && !meta.locked)
  }

  function accessOf(meta: RoomMeta, peer: Peer): RoomAccess {
    return { kind: meta.kind, role: peer.access?.role ?? 'edit', host: peer.access?.host ?? false, locked: meta.locked, status: meta.status }
  }

  /** Tells everyone in the room what changed about their access (lock, share, end). */
  function announce(id: string, meta: RoomMeta) {
    const room = rooms.get(id)
    if (!room) return
    for (const peer of room.peers) {
      peer.access = accessOf(meta, peer)
      peer.send({ type: 'room', access: peer.access })
    }
  }

  async function hostAction(response: ServerResponse, id: string, action: HostAction, request: IncomingMessage) {
    const body = await readJson(request)
    if (!body) return json(response, 400, { error: 'That request could not be read.' })
    const meta = await registry.get(id)
    if (!meta) return json(response, 404, { error: 'That simulation was not found.' })
    const key = typeof body.hostKey === 'string' ? body.hostKey : undefined
    if (!hostKeySchema.safeParse(key).success || !registry.verifyHost(meta, key)) return json(response, 403, { error: 'Only the host can do that.' })
    const now = new Date().toISOString()
    let next: RoomMeta | undefined
    if (action === 'reopen') {
      if (meta.status !== 'ended') return json(response, 409, { error: 'This simulation is not ended.' })
      next = await registry.mutate(id, ({ endedAt: _endedAt, endedReason: _endedReason, ...rest }) => ({ ...rest, status: 'active', touchedAt: now }))
    } else if (meta.status === 'ended') {
      return json(response, 409, { error: 'This simulation has ended. Reopen it first.' })
    } else if (action === 'end') {
      next = await registry.mutate(id, (current) => ({ ...current, status: 'ended', endedAt: now, endedReason: 'host' }))
    } else if (action === 'share') {
      next = await registry.mutate(id, (current) => ({ ...current, kind: 'shared' }))
    } else {
      if (meta.kind !== 'shared') return json(response, 409, { error: 'Only shared simulations can be locked. Share it first.' })
      next = await registry.mutate(id, (current) => ({ ...current, locked: action === 'lock' }))
    }
    if (!next) return json(response, 500, { error: 'The request could not be completed.' })
    announce(id, next)
    if (action === 'end') {
      // Everyone is told, then disconnected; the scene stays on disk until it is reopened or the retention period passes.
      const room = rooms.get(id)
      if (room) for (const peer of [...room.peers]) peer.close?.()
      await rooms.drop(id)
    }
    json(response, 200, { kind: next.kind, locked: next.locked, status: next.status })
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean)
    void (async () => {
      try {
        if (url.pathname === '/sync-api/health') return json(response, 200, { status: 'ok', service: 'mbfd-tactical-sync' })
        if (parts[0] === 'media' && parts[1] && request.method === 'GET') return await media.serve(request, response, parts[1])
        if (url.pathname === '/sync-api/media' && request.method === 'POST') return await media.upload(request, response)
        if (url.pathname === '/sync-api/rooms' && request.method === 'POST') {
          const body = await readJson(request)
          if (!body || (body.kind !== 'solo' && body.kind !== 'shared')) return json(response, 400, { error: 'Choose a private or shared simulation.' })
          if (!mayCreate(clientAddress(request))) return json(response, 429, { error: 'Too many simulations were started from this connection. Try again later.' })
          const created = await registry.create(body.kind as StoredKind, maxScenes)
          if ('error' in created) return json(response, 503, { error: 'The server has reached its simulation limit. Try again later.' })
          return json(response, 201, { id: created.id, hostKey: created.hostKey, kind: body.kind })
        }
        if (parts[0] === 'sync-api' && parts[1] === 'rooms' && parts[2] && parts[3] && request.method === 'POST' && sceneIdSchema.safeParse(parts[2]).success) {
          const action = HOST_ACTIONS.find((candidate) => candidate === parts[3])
          if (action) return await hostAction(response, parts[2], action, request)
        }
        if (parts[0] === 'sync-api' && parts[1] === 'scenes' && parts[2] && sceneIdSchema.safeParse(parts[2]).success) {
          const id = parts[2]
          if (parts[3] === 'peers' && request.method === 'GET') return json(response, 200, { peers: rooms.get(id)?.peers.size ?? 0 })
          if (parts[3] === 'history' && !parts[4] && request.method === 'GET') {
            if (!(await mayEdit(id, request))) return json(response, 403, { error: 'Only the host can see saved versions of this simulation.' })
            return json(response, 200, { items: await files.history(id) })
          }
          if (parts[3] === 'history' && parts[4] && parts[5] === 'restore' && request.method === 'POST') {
            if (!(await mayEdit(id, request))) return json(response, 403, { error: 'Only the host can restore a saved version of this simulation.' })
            // Each restore snapshots first; pacing them keeps real history from being pushed out.
            if (Date.now() - (lastRestore.get(id) ?? 0) < RESTORE_INTERVAL_MS) return json(response, 429, { error: 'A version was just restored. Wait a few seconds and try again.' })
            const board = await files.loadSnapshot(id, parts[4])
            if (!board) return json(response, 404, { error: 'That saved version was not found.' })
            lastRestore.set(id, Date.now())
            const room = rooms.get(id)
            if (room) return json(response, 200, { version: await room.replace('server', board, 'Restore') })
            // Nobody is in the scene: keep a different scenario's work parked before restoring over it.
            const stored = await files.load(id)
            if (stored && scenarioKey(stored.board) !== scenarioKey(board)) await files.park(id, scenarioKey(stored.board), stored.board)
            if (stored) await files.snapshot(id, stored, 'Before restore')
            await files.save(id, { board, version: Date.now() })
            return json(response, 200, { version: 0 })
          }
        }
        json(response, 404, { error: 'Not found' })
      } catch (error) {
        console.error('Request failed', error)
        json(response, 500, { error: 'The request could not be completed.' })
      }
    })()
  })

  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => socket.destroy())
    const match = /^\/sync\/([a-z0-9]{4,24})$/.exec(new URL(request.url ?? '/', 'http://localhost').pathname)
    if (!match) { socket.destroy(); return }
    const address = clientAddress(request)
    if ((connectionsByAddress.get(address) ?? 0) >= maxPerAddress) {
      console.warn(`Refused a connection from ${address}: ${maxPerAddress} already open`)
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      return
    }
    wss.handleUpgrade(request, socket, head, (ws) => connect(ws, match[1]!, address))
  })

  function connect(ws: WebSocket, sceneId: string, address: string) {
    connectionsByAddress.set(address, (connectionsByAddress.get(address) ?? 0) + 1)
    let room: Room | undefined
    let peer: Peer | undefined
    let joining = false
    let windowStart = Date.now()
    let count = 0
    let bytes = 0
    let alive = true
    const send = (message: ServerMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)) }
    const refuse = (code: keyof typeof denialText, message = denialText[code]) => { send({ type: 'error', code, message }); ws.close() }
    // Oversized or malformed frames end only this connection, never the service.
    ws.on('error', () => ws.terminate())
    ws.on('pong', () => { alive = true })
    const heartbeat = setInterval(() => {
      if (!alive) { ws.terminate(); return }
      alive = false
      ws.ping()
    }, 30_000)

    ws.on('message', async (data: Buffer) => {
      const now = Date.now()
      if (now - windowStart > 1000) { windowStart = now; count = 0; bytes = 0 }
      count += 1
      bytes += data.length
      let parsed
      let raw: unknown
      try { raw = JSON.parse(String(data)); parsed = clientMessageSchema.safeParse(raw) } catch { parsed = undefined }
      const id = parsed?.success && parsed.data.type === 'patch' ? parsed.data.id : undefined
      if (count > MESSAGES_PER_SECOND || bytes > BYTES_PER_SECOND) { send({ type: 'error', id, message: 'Too many changes at once; the scene was reloaded.' }); return }
      if (!parsed?.success) {
        // A tab still running the previous release sends changes without naming their scenario.
        const outdated = raw !== null && typeof raw === 'object' && (raw as { type?: unknown }).type === 'patch' && !('on' in raw)
        send({ type: 'error', message: outdated ? 'This page is out of date. Reload it to keep working.' : 'That change could not be read and was not applied.' })
        return
      }
      const message = parsed.data
      try {
        if (message.type === 'ping') { send({ type: 'pong', now: Date.now() }); return }
        if (message.type === 'hello') {
          if (room || joining) return
          joining = true
          // Whether this connection may open the room at all, and as what, is decided here, before anything is loaded or created.
          const decision = await registry.decide(sceneId, { hostKey: message.hostKey, role: message.role }, await rooms.exists(sceneId))
          // The visitor may have left while the scene was loading.
          if (ws.readyState !== ws.OPEN) return
          if (!decision.ok) { refuse(decision.code, decision.message); return }
          const opened = await rooms.open(sceneId, decision.access.host ? message.seed : undefined)
          if (ws.readyState !== ws.OPEN) return
          if (!opened) { refuse('not-found'); return }
          if (opened.peers.size >= maxPeers) { refuse('full', 'This simulation is full. Start your own instead.'); return }
          room = opened
          peer = { id: message.clientId, send, access: decision.access, close: () => ws.close(4001, 'replaced') }
          room.join(peer)
          void registry.touch(sceneId).catch((error: unknown) => console.error('Recording room use failed', error))
          return
        }
        if (!room || !peer) { send({ type: 'error', id: message.id, message: 'Not connected to a scene yet.' }); return }
        if (peer.access?.role === 'view') {
          // The classroom display receives everything and changes nothing. Its change is acknowledged and dropped so it never retries.
          if (message.type === 'patch') { send({ type: 'ack', id: message.id, version: room.current.version }); return }
          send({ type: 'error', id: message.id, code: 'read-only', message: 'This display is view only.' })
          return
        }
        if (message.type === 'switch') {
          if (Date.now() - (lastSwitch.get(sceneId) ?? 0) < SWITCH_INTERVAL_MS) { send({ type: 'error', message: 'The scenario was just switched. Try again in a moment.' }); return }
          lastSwitch.set(sceneId, Date.now())
          const version = await room.switchScenario(peer.id, message.key, message.seed)
          send({ type: 'ack', id: message.id, version })
          return
        }
        room.applyPatch(peer, message.id, message.patch, message.on)
        void registry.touch(sceneId).catch((error: unknown) => console.error('Recording room use failed', error))
      } catch (error) {
        console.error('Message failed', error)
        send({ type: 'error', id, message: error instanceof Error ? error.message : 'That change could not be applied.' })
      } finally {
        if (message.type === 'hello') joining = false
      }
    })
    ws.on('close', () => {
      clearInterval(heartbeat)
      const remaining = (connectionsByAddress.get(address) ?? 1) - 1
      if (remaining > 0) connectionsByAddress.set(address, remaining)
      else connectionsByAddress.delete(address)
      if (room && peer) room.leave(peer)
    })
  }

  /** Ends rooms unused for a long time and deletes rooms that stayed ended. Never touches rooms with people in them or legacy rooms. */
  async function runLifecycle(now = Date.now()) {
    const result = await registry.sweep(now, (id) => (rooms.get(id)?.peers.size ?? 0) > 0, (id) => rooms.drop(id))
    if (result.ended.length || result.deleted.length) console.log(`Room lifecycle: ended ${result.ended.length}, deleted ${result.deleted.length}`)
    return result
  }

  const sweep = setInterval(() => { rooms.evictIdle().catch((error: unknown) => console.error('Idle scene cleanup failed', error)) }, 60_000)
  const lifecycle = setInterval(() => { runLifecycle().catch((error: unknown) => console.error('Room lifecycle sweep failed', error)) }, options.lifecycleEveryMs ?? 10 * 60_000)
  server.on('close', () => { clearInterval(sweep); clearInterval(lifecycle) })

  return {
    server,
    rooms,
    registry,
    runLifecycle,
    async close() {
      clearInterval(sweep)
      clearInterval(lifecycle)
      for (const client of wss.clients) client.terminate()
      await rooms.flushAll()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
