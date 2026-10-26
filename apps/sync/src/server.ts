import { createServer, type IncomingMessage } from 'node:http'
import path from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { clientMessageSchema, sceneIdSchema, type ServerMessage } from '@mbfd/domain'
import { SceneFiles } from './files.js'
import { MediaStore, json } from './media.js'
import { RoomManager, defaultTiming, type Peer, type Room, type RoomTiming } from './rooms.js'

export interface SyncOptions {
  dataDir: string
  timing?: RoomTiming
  maxPeersPerRoom?: number
  maxConnectionsPerAddress?: number
  maxMediaBytes?: number
}

const MESSAGES_PER_SECOND = 80
const BYTES_PER_SECOND = 16 * 1024 * 1024
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024
const RESTORE_INTERVAL_MS = 10_000

/** The visitor's address as Cloudflare and Caddy report it, for per-address limits. */
function clientAddress(request: IncomingMessage): string {
  const header = request.headers['cf-connecting-ip'] ?? request.headers['x-forwarded-for']
  const first = (Array.isArray(header) ? header[0] : header)?.split(',')[0]?.trim()
  return first || request.socket.remoteAddress || 'unknown'
}

export function createSyncServer(options: SyncOptions) {
  const files = new SceneFiles(options.dataDir)
  const rooms = new RoomManager(files, options.timing ?? defaultTiming)
  const media = new MediaStore(path.join(options.dataDir, 'media'), options.maxMediaBytes ?? 8 * 1024 * 1024 * 1024)
  const maxPeers = options.maxPeersPerRoom ?? 150
  const maxPerAddress = options.maxConnectionsPerAddress ?? 40
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES })
  const connectionsByAddress = new Map<string, number>()
  const lastRestore = new Map<string, number>()

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean)
    void (async () => {
      try {
        if (url.pathname === '/sync-api/health') return json(response, 200, { status: 'ok', service: 'mbfd-tactical-sync' })
        if (parts[0] === 'media' && parts[1] && request.method === 'GET') return await media.serve(request, response, parts[1])
        if (url.pathname === '/sync-api/media' && request.method === 'POST') return await media.upload(request, response)
        if (parts[0] === 'sync-api' && parts[1] === 'scenes' && parts[2] && sceneIdSchema.safeParse(parts[2]).success) {
          const id = parts[2]
          if (parts[3] === 'peers' && request.method === 'GET') return json(response, 200, { peers: rooms.get(id)?.peers.size ?? 0 })
          if (parts[3] === 'history' && !parts[4] && request.method === 'GET') return json(response, 200, { items: await files.history(id) })
          if (parts[3] === 'history' && parts[4] && parts[5] === 'restore' && request.method === 'POST') {
            // Each restore snapshots first; pacing them keeps real history from being pushed out.
            if (Date.now() - (lastRestore.get(id) ?? 0) < RESTORE_INTERVAL_MS) return json(response, 429, { error: 'A version was just restored. Wait a few seconds and try again.' })
            const board = await files.loadSnapshot(id, parts[4])
            if (!board) return json(response, 404, { error: 'That saved version was not found.' })
            lastRestore.set(id, Date.now())
            const room = rooms.get(id)
            if (room) return json(response, 200, { version: await room.replace('server', board, 'Restore') })
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
      try { parsed = clientMessageSchema.safeParse(JSON.parse(String(data))) } catch { parsed = undefined }
      const id = parsed?.success && parsed.data.type === 'patch' ? parsed.data.id : undefined
      if (count > MESSAGES_PER_SECOND || bytes > BYTES_PER_SECOND) { send({ type: 'error', id, message: 'Too many changes at once; the scene was reloaded.' }); return }
      if (!parsed?.success) { send({ type: 'error', message: 'That change could not be read and was not applied.' }); return }
      const message = parsed.data
      try {
        if (message.type === 'ping') { send({ type: 'pong', now: Date.now() }); return }
        if (message.type === 'hello') {
          if (room || joining) return
          joining = true
          const opened = await rooms.open(sceneId, message.seed)
          // The visitor may have left while the scene was loading.
          if (ws.readyState !== ws.OPEN) return
          if (opened.peers.size >= maxPeers) { send({ type: 'error', message: 'This scene is full. Start a separate scene instead.' }); ws.close(); return }
          room = opened
          peer = { id: message.clientId, send }
          room.join(peer)
          return
        }
        if (!room || !peer) { send({ type: 'error', id: message.id, message: 'Not connected to a scene yet.' }); return }
        room.applyPatch(peer, message.id, message.patch)
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

  const sweep = setInterval(() => { rooms.evictIdle().catch((error: unknown) => console.error('Idle scene cleanup failed', error)) }, 60_000)
  server.on('close', () => clearInterval(sweep))

  return {
    server,
    rooms,
    async close() {
      clearInterval(sweep)
      for (const client of wss.clients) client.terminate()
      await rooms.flushAll()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
