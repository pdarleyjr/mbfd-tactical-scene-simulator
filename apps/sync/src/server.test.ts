import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { boardSchema, type Board, type SceneObject, type ServerMessage } from '@mbfd/domain'
import { createSyncServer } from './server.js'
import { SceneFiles, HISTORY_LIMIT } from './files.js'

const note = (id: string, x = 0): SceneObject => ({ id, type: 'note', x, y: 0, rotation: 0, text: id, locked: false })

function seed(objects: SceneObject[] = []): Board {
  return boardSchema.parse({
    schemaVersion: 3,
    id: 'seed-board',
    name: 'Drill',
    templateId: null,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    scenario: {
      title: 'Drill', description: '', dispatch: '', background: { kind: 'builtin', url: '/map.webp' }, world: { width: 1000, height: 800 },
      northDegrees: 0, weather: { windFromDegrees: 0, windMph: 0, temperatureF: 80, conditions: '' }, injects: [], benchmarks: [],
    },
    objects,
    training: { timer: { running: false, startedAt: null, accumulatedMs: 0 }, revealed: {}, completed: {}, notes: '' },
    snapshots: [],
    run: null,
  })
}

/** A test browser: collects every message and can wait for one. */
class Client {
  readonly messages: ServerMessage[] = []
  private waiters: Array<{ match: (message: ServerMessage) => boolean; resolve: (message: ServerMessage) => void }> = []
  readonly ws: WebSocket

  constructor(url: string) {
    this.ws = new WebSocket(url)
    this.ws.on('message', (data) => {
      const message = JSON.parse(String(data)) as ServerMessage
      this.messages.push(message)
      this.waiters = this.waiters.filter((waiter) => { if (!waiter.match(message)) return true; waiter.resolve(message); return false })
    })
  }

  opened() { return new Promise<void>((resolve, reject) => { this.ws.once('open', () => resolve()); this.ws.once('error', reject) }) }

  next<T extends ServerMessage['type']>(type: T, match: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true): Promise<Extract<ServerMessage, { type: T }>> {
    const found = this.messages.find((message) => message.type === type && match(message as Extract<ServerMessage, { type: T }>))
    if (found) { this.messages.splice(this.messages.indexOf(found), 1); return Promise.resolve(found as Extract<ServerMessage, { type: T }>) }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No ${type} message`)), 3000)
      this.waiters.push({
        match: (message) => message.type === type && match(message as Extract<ServerMessage, { type: T }>),
        resolve: (message) => { clearTimeout(timer); this.messages.splice(this.messages.indexOf(message), 1); resolve(message as Extract<ServerMessage, { type: T }>) },
      })
    })
  }

  send(message: unknown) { this.ws.send(JSON.stringify(message)) }
  close() { this.ws.close() }
}

let dataDir: string
let sync: ReturnType<typeof createSyncServer>
let base: string
const clients: Client[] = []

async function join(sceneId: string, clientId: string, board = seed()) {
  const client = new Client(`ws://127.0.0.1:${new URL(base).port}/sync/${sceneId}`)
  clients.push(client)
  await client.opened()
  client.send({ type: 'hello', clientId, seed: board })
  const state = await client.next('state')
  return { client, state }
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mbfd-sync-'))
  sync = createSyncServer({ dataDir, timing: { saveDelayMs: 20, snapshotEveryMs: 60_000, idleEvictMs: 0 }, maxPeersPerRoom: 3 })
  await new Promise<void>((resolve) => sync.server.listen(0, '127.0.0.1', () => resolve()))
  base = `http://127.0.0.1:${(sync.server.address() as AddressInfo).port}`
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.close()
  await sync.close()
  await rm(dataDir, { recursive: true, force: true })
})

describe('live rooms', () => {
  it('creates a scene from the first visitor’s seed and gives later visitors the live state', async () => {
    const { client: first, state } = await join('main', 'one', seed([note('a')]))
    expect(state.board.objects.map((object) => object.id)).toEqual(['a'])
    expect(state.peers).toBe(1)
    const { state: second } = await join('main', 'two', seed([note('ignored')]))
    expect(second.board.objects.map((object) => object.id)).toEqual(['a'])
    expect(second.peers).toBe(2)
    expect((await first.next('presence')).peers).toBe(2)
  })

  it('relays a patch to everyone else, acks the sender, and saves it', async () => {
    const { client: one } = await join('main', 'one')
    const { client: two } = await join('main', 'two')
    one.send({ type: 'patch', id: 'p1', patch: { upserts: [note('e1', 40)] } })
    const relayed = await two.next('patch')
    expect(relayed.from).toBe('one')
    expect(relayed.patch.upserts?.[0]).toMatchObject({ id: 'e1', x: 40 })
    expect((await one.next('ack')).id).toBe('p1')
    expect(one.messages.some((message) => message.type === 'patch')).toBe(false)
    await new Promise((resolve) => setTimeout(resolve, 80))
    const saved = JSON.parse(await readFile(path.join(dataDir, 'scenes', 'main', 'current.json'), 'utf8')) as { board: Board; version: number }
    expect(saved.board.objects.map((object) => object.id)).toEqual(['e1'])
    expect(saved.version).toBe(1)
  })

  it('keeps separate scenes apart', async () => {
    const { client: main } = await join('main', 'one')
    const { client: other } = await join('abcd2345', 'two')
    other.send({ type: 'patch', id: 'p', patch: { upserts: [note('only-here')] } })
    await other.next('ack')
    expect(main.messages.some((message) => message.type === 'patch')).toBe(false)
    const response = await fetch(`${base}/sync-api/scenes/abcd2345/peers`)
    expect(await response.json()).toEqual({ peers: 1 })
  })

  it('rejects malformed changes without dropping the connection', async () => {
    const { client } = await join('main', 'one')
    client.send({ type: 'patch', id: 'bad', patch: { upserts: [{ id: 'x', type: 'tank' }] } })
    expect((await client.next('error')).message).toMatch(/could not be read/)
    client.ws.send('not json')
    await client.next('error')
    client.send({ type: 'ping' })
    expect((await client.next('pong')).now).toBeGreaterThan(0)
  })

  it('refuses edits before joining, and turns people away from a full scene', async () => {
    const early = new Client(`ws://127.0.0.1:${new URL(base).port}/sync/main`)
    clients.push(early)
    await early.opened()
    early.send({ type: 'patch', id: 'x', patch: { removes: ['a'] } })
    expect((await early.next('error')).message).toMatch(/Not connected/)
    await join('main', 'a')
    await join('main', 'b')
    await join('main', 'c')
    const late = new Client(`ws://127.0.0.1:${new URL(base).port}/sync/main`)
    clients.push(late)
    await late.opened()
    late.send({ type: 'hello', clientId: 'd', seed: seed() })
    expect((await late.next('error')).message).toMatch(/full/)
  })

  it('snapshots before a replace and when the last person leaves, and restores a version for everyone', async () => {
    const { client: one } = await join('main', 'one', seed([note('original')]))
    one.send({ type: 'replace', id: 'r1', board: seed([note('imported')]) })
    expect((await one.next('replace')).board.objects[0]?.id).toBe('imported')
    const history = await (await fetch(`${base}/sync-api/scenes/main/history`)).json() as { items: Array<{ name: string; reason: string; objectCount: number }> }
    expect(history.items[0]).toMatchObject({ reason: 'Before replace', objectCount: 1 })

    const { client: two } = await join('main', 'two')
    const restored = await fetch(`${base}/sync-api/scenes/main/history/${history.items[0]!.name}/restore`, { method: 'POST' })
    expect(restored.status).toBe(200)
    expect((await two.next('replace')).board.objects[0]?.id).toBe('original')

    one.close()
    two.close()
    await new Promise((resolve) => setTimeout(resolve, 150))
    const after = await (await fetch(`${base}/sync-api/scenes/main/history`)).json() as { items: Array<{ reason: string }> }
    expect(after.items.map((item) => item.reason)).toContain('Last person left')
  })

  it('reloads a saved scene after the server restarts', async () => {
    const { client } = await join('main', 'one')
    client.send({ type: 'patch', id: 'p', patch: { upserts: [note('kept')] } })
    await client.next('ack')
    client.close()
    await sync.close()
    sync = createSyncServer({ dataDir })
    await new Promise<void>((resolve) => sync.server.listen(0, '127.0.0.1', () => resolve()))
    base = `http://127.0.0.1:${(sync.server.address() as AddressInfo).port}`
    const { state } = await join('main', 'two', seed([note('fresh-seed')]))
    expect(state.board.objects.map((object) => object.id)).toEqual(['kept'])
  })
})

describe('http routes', () => {
  it('reports health and 404s unknown paths and bad scene ids', async () => {
    expect(await (await fetch(`${base}/sync-api/health`)).json()).toMatchObject({ status: 'ok' })
    expect((await fetch(`${base}/sync-api/nope`)).status).toBe(404)
    expect((await fetch(`${base}/sync-api/scenes/BAD!/history`)).status).toBe(404)
    expect((await fetch(`${base}/sync-api/scenes/main/history/missing/restore`, { method: 'POST' })).status).toBe(404)
  })

  it('stores uploaded media and serves it back, including byte ranges', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5, 6])
    const upload = await fetch(`${base}/sync-api/media`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: bytes })
    expect(upload.status).toBe(201)
    const { url } = await upload.json() as { url: string }
    expect(url).toMatch(/^\/media\/[0-9a-f-]{36}\.png$/)
    const full = await fetch(`${base}${url}`)
    expect(full.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(bytes)
    const part = await fetch(`${base}${url}`, { headers: { Range: 'bytes=2-4' } })
    expect(part.status).toBe(206)
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(bytes.slice(2, 5))
    expect((await fetch(`${base}${url}`, { headers: { Range: 'bytes=99-' } })).status).toBe(416)
    expect((await fetch(`${base}/media/../../etc/passwd`)).status).toBe(404)
  })

  it('refuses unsupported and oversized uploads', async () => {
    expect((await fetch(`${base}/sync-api/media`, { method: 'POST', headers: { 'Content-Type': 'text/html' }, body: '<script>' })).status).toBe(415)
    const small = createSyncServer({ dataDir: path.join(dataDir, 'small'), maxMediaBytes: 4 })
    await new Promise<void>((resolve) => small.server.listen(0, '127.0.0.1', () => resolve()))
    const port = (small.server.address() as AddressInfo).port
    const response = await fetch(`http://127.0.0.1:${port}/sync-api/media`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(10) })
    expect(response.status).toBe(507)
    await small.close()
  })
})

describe('scene files', () => {
  it('keeps at most the newest snapshots and ignores unreadable ones', async () => {
    const files = new SceneFiles(dataDir)
    for (let index = 0; index < HISTORY_LIMIT + 3; index += 1) await files.snapshot('abcd', { board: seed(), version: index }, 'Automatic')
    const names = await readdir(path.join(dataDir, 'scenes', 'abcd', 'history'))
    expect(names).toHaveLength(HISTORY_LIMIT)
    expect(await files.loadSnapshot('abcd', '../../etc')).toBeUndefined()
    expect(await files.load('zzzz')).toBeUndefined()
    expect(await files.history('zzzz')).toEqual([])
  })
})
