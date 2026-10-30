import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { type Board } from '@mbfd/domain'
import { createSyncServer } from './server.js'
import { Client, note, seed } from './test-support.js'
import { SceneFiles, HISTORY_LIMIT } from './files.js'

let dataDir: string
let sync: ReturnType<typeof createSyncServer>
let base: string
const clients: Client[] = []

/**
 * Scenes made before rooms had owners exist as plain folders on disk and stay
 * joinable by their link. Visiting an address no longer creates one, so these
 * tests set the scene up the way the live server's older scenes already are.
 */
async function legacyScene(sceneId: string, board: Board) {
  const files = new SceneFiles(dataDir)
  if (!(await files.load(sceneId)) && !sync.rooms.get(sceneId)) await files.save(sceneId, { board, version: 0 })
}

async function join(sceneId: string, clientId: string, board = seed()) {
  await legacyScene(sceneId, board)
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
  it('opens a scene that already exists and gives later visitors the live state', async () => {
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
    one.send({ type: 'patch', id: 'p1', on: 'custom', patch: { upserts: [note('e1', 40)] } })
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

  it('still saves during continuous editing', async () => {
    await sync.close()
    sync = createSyncServer({ dataDir, timing: { saveDelayMs: 200, saveMaxWaitMs: 300, snapshotEveryMs: 60_000, idleEvictMs: 60_000 } })
    await new Promise<void>((resolve) => sync.server.listen(0, '127.0.0.1', () => resolve()))
    base = `http://127.0.0.1:${(sync.server.address() as AddressInfo).port}`
    const { client } = await join('main', 'one')
    for (let step = 0; step < 8; step += 1) {
      client.send({ type: 'patch', id: `p${step}`, on: 'custom', patch: { upserts: [note('dragged', step)] } })
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    const saved = JSON.parse(await readFile(path.join(dataDir, 'scenes', 'main', 'current.json'), 'utf8')) as { board: Board }
    expect(saved.board.objects[0]).toMatchObject({ id: 'dragged' })
  })

  it('keeps separate scenes apart', async () => {
    const { client: main } = await join('main', 'one')
    const { client: other } = await join('abcd2345', 'two')
    other.send({ type: 'patch', id: 'p', on: 'custom', patch: { upserts: [note('only-here')] } })
    await other.next('ack')
    expect(main.messages.some((message) => message.type === 'patch')).toBe(false)
    const response = await fetch(`${base}/sync-api/scenes/abcd2345/peers`)
    expect(await response.json()).toEqual({ peers: 1 })
  })

  it('rejects malformed changes without dropping the connection', async () => {
    const { client } = await join('main', 'one')
    client.send({ type: 'patch', id: 'bad', on: 'custom', patch: { upserts: [{ id: 'x', type: 'tank' }] } })
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
    early.send({ type: 'patch', id: 'x', on: 'custom', patch: { removes: ['a'] } })
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

  it('snapshots when the last person leaves and before a restore, and restores a version for everyone', async () => {
    const { client: one } = await join('main', 'one', seed([note('original')]))
    one.send({ type: 'patch', id: 'p1', on: 'custom', patch: { upserts: [note('added')] } })
    await one.next('ack')
    one.close()
    await new Promise((resolve) => setTimeout(resolve, 150))
    const history = await (await fetch(`${base}/sync-api/scenes/main/history`)).json() as { items: Array<{ name: string; reason: string; objectCount: number }> }
    expect(history.items[0]).toMatchObject({ reason: 'Last person left', objectCount: 2 })

    const { client: two } = await join('main', 'two')
    two.send({ type: 'patch', id: 'p2', on: 'custom', patch: { removes: ['original', 'added'] } })
    await two.next('ack')
    const restored = await fetch(`${base}/sync-api/scenes/main/history/${history.items[0]!.name}/restore`, { method: 'POST' })
    expect(restored.status).toBe(200)
    expect((await two.next('replace')).board.objects.map((object) => object.id)).toEqual(['original', 'added'])
    const after = await (await fetch(`${base}/sync-api/scenes/main/history`)).json() as { items: Array<{ reason: string; objectCount: number }> }
    expect(after.items[0]).toMatchObject({ reason: 'Before restore', objectCount: 0 })

    // Restores are paced so a burst cannot push real history out.
    const again = await fetch(`${base}/sync-api/scenes/main/history/${history.items[0]!.name}/restore`, { method: 'POST' })
    expect(again.status).toBe(429)
  })

  it('survives an oversized frame: only that connection closes', async () => {
    const { client: big } = await join('main', 'big')
    const closed = new Promise<number>((resolve) => big.ws.once('close', (code) => resolve(code)))
    big.ws.send('x'.repeat(5 * 1024 * 1024))
    expect(await closed).toBeGreaterThan(1000)
    const { state } = await join('main', 'after')
    expect(state.type).toBe('state')
  })

  it('refuses a change that would push a scene past the object limit, naming the change', async () => {
    const { client } = await join('main', 'one')
    const many = (prefix: string) => Array.from({ length: 2600 }, (_, index) => note(`${prefix}${index}`))
    client.send({ type: 'patch', id: 'first', on: 'custom', patch: { upserts: many('a') } })
    await client.next('ack', (message) => message.id === 'first')
    client.send({ type: 'patch', id: 'second', on: 'custom', patch: { upserts: many('b') } })
    const error = await client.next('error')
    expect(error.id).toBe('second')
    expect(error.message).toMatch(/up to 5000 objects/)
    expect(sync.rooms.get('main')?.current.board.objects).toHaveLength(2600)
  })

  it('limits connections from one address', async () => {
    await sync.close()
    sync = createSyncServer({ dataDir, maxConnectionsPerAddress: 2 })
    await new Promise<void>((resolve) => sync.server.listen(0, '127.0.0.1', () => resolve()))
    base = `http://127.0.0.1:${(sync.server.address() as AddressInfo).port}`
    await join('main', 'a')
    await join('main', 'b')
    const third = new WebSocket(`ws://127.0.0.1:${new URL(base).port}/sync/main`)
    const outcome = await new Promise<string>((resolve) => { third.once('open', () => resolve('open')); third.once('error', () => resolve('refused')) })
    expect(outcome).toBe('refused')
  })
  it('reloads a saved scene after the server restarts', async () => {
    const { client } = await join('main', 'one')
    client.send({ type: 'patch', id: 'p', on: 'custom', patch: { upserts: [note('kept')] } })
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

describe('switching scenarios', () => {
  it('switches everyone, keeps the old scenario, and brings it back exactly on switching back', async () => {
    const { client: one } = await join('main', 'one', seed([note('waterfront-e1')], 'waterfront-estate', 'Waterfront'))
    const { client: two } = await join('main', 'two')

    one.send({ type: 'switch', id: 's1', key: 'oceanfront-condo', seed: seed([], 'oceanfront-condo', 'Oceanfront') })
    const toOcean = await two.next('replace')
    expect(toOcean).toMatchObject({ reason: 'switch', from: 'one' })
    expect(toOcean.board.scenario.title).toBe('Oceanfront')
    expect((await one.next('replace')).board.templateId).toBe('oceanfront-condo')
    await one.next('ack', (message) => message.id === 's1')

    two.send({ type: 'patch', id: 'p1', patch: { upserts: [note('ocean-flames')] }, on: 'oceanfront-condo' })
    await two.next('ack', (message) => message.id === 'p1')

    await new Promise((resolve) => setTimeout(resolve, 2100))
    two.send({ type: 'switch', id: 's2', key: 'waterfront-estate', seed: seed([], 'waterfront-estate', 'Waterfront') })
    const back = await one.next('replace', (message) => message.board.templateId === 'waterfront-estate')
    expect(back.board.objects.map((object) => object.id)).toEqual(['waterfront-e1'])

    await new Promise((resolve) => setTimeout(resolve, 2100))
    one.send({ type: 'switch', id: 's3', key: 'oceanfront-condo', seed: seed([], 'oceanfront-condo', 'Oceanfront') })
    const again = await two.next('replace', (message) => message.board.templateId === 'oceanfront-condo')
    expect(again.board.objects.map((object) => object.id)).toEqual(['ocean-flames'])

    const history = await (await fetch(`${base}/sync-api/scenes/main/history`)).json() as { items: Array<{ reason: string; title: string }> }
    // The Oceanfront had been edited, so leaving it snapshotted it, labelled with its own title.
    expect(history.items.find((item) => item.reason === 'Before switching to Waterfront')?.title).toBe('Oceanfront')
  })

  it('drops a change made on the scenario the scene just left', async () => {
    const { client } = await join('main', 'one', seed([], 'waterfront-estate'))
    client.send({ type: 'switch', id: 's', key: 'oceanfront-condo', seed: seed([], 'oceanfront-condo') })
    await client.next('replace')
    client.send({ type: 'patch', id: 'late', patch: { upserts: [note('stale-move')] }, on: 'waterfront-estate' })
    await client.next('ack', (message) => message.id === 'late')
    expect(sync.rooms.get('main')?.current.board.objects).toEqual([])
  })

  it('paces switches and refuses a starting board that does not match the scenario', async () => {
    const { client } = await join('main', 'one', seed([], 'waterfront-estate'))
    client.send({ type: 'switch', id: 'bad', key: 'oceanfront-condo', seed: seed([], 'waterfront-estate') })
    expect((await client.next('error')).message).toMatch(/could not be read/)
    client.send({ type: 'switch', id: 's1', key: 'oceanfront-condo', seed: seed([], 'oceanfront-condo') })
    await client.next('replace')
    client.send({ type: 'switch', id: 's2', key: 'waterfront-estate', seed: seed([], 'waterfront-estate') })
    expect((await client.next('error')).message).toMatch(/just switched/)
  })
})
describe('review fixes for switching', () => {
  it('tells a tab running the previous release to reload', async () => {
    const { client } = await join('main', 'one')
    client.send({ type: 'patch', id: 'old', patch: { removes: ['a'] } })
    expect((await client.next('error')).message).toMatch(/out of date/)
  })

  it('restoring a saved version from another scenario parks the current scenario instead of losing it', async () => {
    const { client } = await join('main', 'one', seed([], 'waterfront-estate', 'Waterfront'))
    client.send({ type: 'patch', id: 'w', on: 'waterfront-estate', patch: { upserts: [note('waterfront-work')] } })
    await client.next('ack')
    client.close()
    await new Promise((resolve) => setTimeout(resolve, 150))
    const history = await (await fetch(`${base}/sync-api/scenes/main/history`)).json() as { items: Array<{ name: string }> }
    const { client: two } = await join('main', 'two')
    two.send({ type: 'switch', id: 's', key: 'oceanfront-condo', seed: seed([note('ocean-work')], 'oceanfront-condo', 'Oceanfront') })
    await two.next('replace')
    // Restore the Waterfront version while the scene is on the Oceanfront.
    expect((await fetch(`${base}/sync-api/scenes/main/history/${history.items[0]!.name}/restore`, { method: 'POST' })).status).toBe(200)
    expect((await two.next('replace', (message) => message.board.templateId === 'waterfront-estate')).board.objects.map((object) => object.id)).toEqual(['waterfront-work'])
    await new Promise((resolve) => setTimeout(resolve, 2100))
    two.send({ type: 'switch', id: 's2', key: 'oceanfront-condo', seed: seed([], 'oceanfront-condo', 'Oceanfront') })
    expect((await two.next('replace', (message) => message.board.templateId === 'oceanfront-condo')).board.objects.map((object) => object.id)).toEqual(['ocean-work'])
  })

  it('runs a switch and a restore one after the other, never interleaved', async () => {
    await join('main', 'one', seed([note('w')], 'waterfront-estate', 'Waterfront'))
    const room = sync.rooms.get('main')!
    const restoreTo = seed([note('restored')], 'waterfront-estate', 'Waterfront')
    await Promise.all([
      room.switchScenario('a', 'oceanfront-condo', seed([note('o')], 'oceanfront-condo', 'Oceanfront')),
      room.replace('b', restoreTo, 'Restore'),
    ])
    expect(room.current.board.objects.map((object) => object.id)).toEqual(['restored'])
    // The Oceanfront board was parked under its own name, not under the restored scenario's.
    const files = new SceneFiles(dataDir)
    expect((await files.loadParked('main', 'oceanfront-condo'))?.objects.map((object) => object.id)).toEqual(['o'])
    expect((await files.loadParked('main', 'waterfront-estate'))?.objects.map((object) => object.id)).toEqual(['w'])
  })

  it('sets a damaged parked scenario aside and starts that scenario fresh', async () => {
    const files = new SceneFiles(dataDir)
    await files.park('abcd', 'oceanfront-condo', seed([], 'oceanfront-condo'))
    await writeFile(path.join(dataDir, 'scenes', 'abcd', 'parked', 'oceanfront-condo.json'), '{ broken')
    expect(await files.loadParked('abcd', 'oceanfront-condo')).toBeUndefined()
    const names = await readdir(path.join(dataDir, 'scenes', 'abcd', 'parked'))
    expect(names.some((name) => name.startsWith('oceanfront-condo.json.damaged-'))).toBe(true)
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
  it('sets a damaged scene aside and falls back to its newest snapshot instead of starting over', async () => {
    const files = new SceneFiles(dataDir)
    await files.snapshot('abcd', { board: seed([note('from-snapshot')]), version: 4 }, 'Automatic')
    await files.save('abcd', { board: seed([note('current')]), version: 5 })
    await writeFile(path.join(dataDir, 'scenes', 'abcd', 'current.json'), '{ not json')
    const loaded = await files.load('abcd')
    expect(loaded?.board.objects.map((object) => object.id)).toEqual(['from-snapshot'])
    const names = await readdir(path.join(dataDir, 'scenes', 'abcd'))
    expect(names.some((name) => name.startsWith('current.json.damaged-'))).toBe(true)
  })
  it('keeps at most the newest snapshots and ignores unreadable ones', async () => {
    const files = new SceneFiles(dataDir)
    for (let index = 0; index < HISTORY_LIMIT + 3; index += 1) await files.snapshot('abcd', { board: seed(), version: index }, 'Automatic')
    const names = await readdir(path.join(dataDir, 'scenes', 'abcd', 'history'))
    expect(names).toHaveLength(HISTORY_LIMIT)
    expect(await files.loadSnapshot('abcd', '../../etc')).toBeUndefined()
    expect(await files.load('zzzz')).toBeUndefined()
    expect(await files.history('zzzz')).toEqual([])
    // 100+ sequential disk writes: give it room when the machine is busy.
  }, 30_000)
})
