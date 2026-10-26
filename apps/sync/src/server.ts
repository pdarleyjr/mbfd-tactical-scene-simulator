import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { clientMessageSchema, sceneIdSchema, type ServerMessage } from '@mbfd/domain'
import { SceneFiles } from './files.js'
import { RoomManager, defaultTiming, type Peer, type Room, type RoomTiming } from './rooms.js'

export interface SyncOptions {
  dataDir: string
  timing?: RoomTiming
  maxPeersPerRoom?: number
  maxMediaBytes?: number
}

const MEDIA_TYPES: Record<string, { ext: string; maxBytes: number }> = {
  'image/png': { ext: 'png', maxBytes: 40 * 1024 * 1024 },
  'image/jpeg': { ext: 'jpg', maxBytes: 40 * 1024 * 1024 },
  'image/webp': { ext: 'webp', maxBytes: 40 * 1024 * 1024 },
  // Cloudflare refuses request bodies over 100 MB, so videos stay under it.
  'video/mp4': { ext: 'mp4', maxBytes: 95 * 1024 * 1024 },
  'video/webm': { ext: 'webm', maxBytes: 95 * 1024 * 1024 },
}
const CONTENT_TYPES = Object.fromEntries(Object.entries(MEDIA_TYPES).map(([type, info]) => [info.ext, type]))
const MESSAGES_PER_SECOND = 80

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(body))
}

export function createSyncServer(options: SyncOptions) {
  const files = new SceneFiles(options.dataDir)
  const rooms = new RoomManager(files, options.timing ?? defaultTiming)
  const mediaDir = path.join(options.dataDir, 'media')
  const maxPeers = options.maxPeersPerRoom ?? 80
  const maxMediaBytes = options.maxMediaBytes ?? 8 * 1024 * 1024 * 1024
  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 })

  async function mediaUsage() {
    try {
      let total = 0
      for (const file of await readdir(mediaDir)) total += (await stat(path.join(mediaDir, file))).size
      return total
    } catch { return 0 }
  }

  async function uploadMedia(request: IncomingMessage, response: ServerResponse) {
    const type = String(request.headers['content-type'] ?? '').split(';')[0]!.trim()
    const rule = MEDIA_TYPES[type]
    if (!rule) return json(response, 415, { error: 'Upload a PNG, JPEG, or WebP image, or an MP4 or WebM video.' })
    const declared = Number(request.headers['content-length'] ?? 0)
    if (declared > rule.maxBytes) return json(response, 413, { error: 'That file is too large.' })
    if ((await mediaUsage()) + declared > maxMediaBytes) return json(response, 507, { error: 'The server is out of space for uploads.' })
    await mkdir(mediaDir, { recursive: true })
    const name = `${randomUUID()}.${rule.ext}`
    const temporary = path.join(mediaDir, `${name}.part`)
    let received = 0
    const out = createWriteStream(temporary)
    let failed = false
    request.on('data', (chunk: Buffer) => {
      received += chunk.length
      if (received > rule.maxBytes && !failed) { failed = true; request.unpipe(out); out.destroy(); void rm(temporary, { force: true }); json(response, 413, { error: 'That file is too large.' }); request.destroy() }
    })
    request.pipe(out)
    out.on('finish', async () => {
      if (failed) return
      await rename(temporary, path.join(mediaDir, name))
      json(response, 201, { url: `/media/${name}`, bytes: received })
    })
    out.on('error', () => { if (!failed) json(response, 500, { error: 'Upload failed.' }) })
  }

  async function serveMedia(request: IncomingMessage, response: ServerResponse, name: string) {
    if (!/^[0-9a-f-]{36}\.(png|jpg|webp|mp4|webm)$/.test(name)) return json(response, 404, { error: 'Not found' })
    const file = path.join(mediaDir, name)
    let size: number
    try { size = (await stat(file)).size } catch { return json(response, 404, { error: 'Not found' }) }
    const headers = { 'Content-Type': CONTENT_TYPES[name.split('.').pop()!] ?? 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'Accept-Ranges': 'bytes' }
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range ?? ''))
    if (range) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); return response.end() }
      response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
      createReadStream(file, { start, end }).pipe(response)
      return
    }
    response.writeHead(200, { ...headers, 'Content-Length': size })
    createReadStream(file).pipe(response)
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const parts = url.pathname.split('/').filter(Boolean)
    void (async () => {
      try {
        if (url.pathname === '/sync-api/health') return json(response, 200, { status: 'ok', service: 'mbfd-tactical-sync' })
        if (parts[0] === 'media' && parts[1] && request.method === 'GET') return await serveMedia(request, response, parts[1])
        if (url.pathname === '/sync-api/media' && request.method === 'POST') return await uploadMedia(request, response)
        if (parts[0] === 'sync-api' && parts[1] === 'scenes' && parts[2] && sceneIdSchema.safeParse(parts[2]).success) {
          const id = parts[2]
          if (parts[3] === 'peers' && request.method === 'GET') return json(response, 200, { peers: rooms.get(id)?.peers.size ?? 0 })
          if (parts[3] === 'history' && !parts[4] && request.method === 'GET') return json(response, 200, { items: await files.history(id) })
          if (parts[3] === 'history' && parts[4] && parts[5] === 'restore' && request.method === 'POST') {
            const board = await files.loadSnapshot(id, parts[4])
            const room = rooms.get(id)
            if (!board) return json(response, 404, { error: 'That saved version was not found.' })
            if (room) return json(response, 200, { version: await room.replace('server', board, 'Restore') })
            await files.save(id, { board, version: Date.now() })
            return json(response, 200, { version: 0 })
          }
        }
        json(response, 404, { error: 'Not found' })
      } catch (error) {
        console.error('Request failed', error)
        if (!response.headersSent) json(response, 500, { error: 'The request could not be completed.' })
      }
    })()
  })

  server.on('upgrade', (request, socket, head) => {
    const match = /^\/sync\/([a-z0-9]{4,24})$/.exec(new URL(request.url ?? '/', 'http://localhost').pathname)
    if (!match) { socket.destroy(); return }
    wss.handleUpgrade(request, socket, head, (ws) => connect(ws, match[1]!))
  })

  function connect(ws: WebSocket, sceneId: string) {
    let room: Room | undefined
    let peer: Peer | undefined
    let windowStart = Date.now()
    let count = 0
    let alive = true
    const send = (message: ServerMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)) }
    ws.on('pong', () => { alive = true })
    const heartbeat = setInterval(() => {
      if (!alive) { ws.terminate(); return }
      alive = false
      ws.ping()
    }, 30_000)

    ws.on('message', async (data) => {
      const now = Date.now()
      if (now - windowStart > 1000) { windowStart = now; count = 0 }
      if (++count > MESSAGES_PER_SECOND) return
      let parsed
      try { parsed = clientMessageSchema.safeParse(JSON.parse(String(data))) } catch { parsed = undefined }
      if (!parsed?.success) { send({ type: 'error', message: 'That change could not be read and was not applied.' }); return }
      const message = parsed.data
      try {
        if (message.type === 'ping') { send({ type: 'pong', now: Date.now() }); return }
        if (message.type === 'hello') {
          if (room) return
          const opened = await rooms.open(sceneId, message.seed)
          if (opened.peers.size >= maxPeers) { send({ type: 'error', message: 'This scene is full. Start a separate scene instead.' }); ws.close(); return }
          room = opened
          peer = { id: message.clientId, send }
          room.join(peer)
          return
        }
        if (!room || !peer) { send({ type: 'error', message: 'Not connected to a scene yet.' }); return }
        if (message.type === 'patch') room.applyPatch(peer, message.id, message.patch)
        else if (message.type === 'replace') {
          const version = await room.replace(peer.id, message.board, 'Replace')
          send({ type: 'ack', id: message.id, version })
        }
      } catch (error) {
        console.error('Message failed', error)
        send({ type: 'error', message: error instanceof Error ? error.message : 'That change could not be applied.' })
      }
    })
    ws.on('close', () => {
      clearInterval(heartbeat)
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
