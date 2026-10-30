import { mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Board, RoomAccess, ServerMessage } from '@mbfd/domain'
import { createSyncServer } from './server.js'
import { SceneFiles } from './files.js'
import { Client, note, seed } from './test-support.js'

/**
 * Solo and shared simulations: who may open a room, what a guest, a display
 * and a host can each do, and how rooms age out. Everything runs against a real
 * sync server and real WebSocket clients.
 */

let dataDir: string
let sync: ReturnType<typeof createSyncServer>
let base: string
const clients: Client[] = []

const DAY = 24 * 60 * 60_000

async function start(options: Partial<Parameters<typeof createSyncServer>[0]> = {}) {
  sync = createSyncServer({ dataDir, timing: { saveDelayMs: 20, snapshotEveryMs: 60_000, idleEvictMs: 0 }, lifecycleEveryMs: 3_600_000, ...options })
  await new Promise<void>((resolve) => sync.server.listen(0, '127.0.0.1', () => resolve()))
  base = `http://127.0.0.1:${(sync.server.address() as AddressInfo).port}`
}

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'mbfd-access-'))
  await start()
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.close()
  await sync.close()
  await rm(dataDir, { recursive: true, force: true })
})

interface Created { id: string; hostKey: string; kind: 'solo' | 'shared' }

async function createRoom(kind: 'solo' | 'shared'): Promise<Created> {
  const response = await fetch(`${base}/sync-api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) })
  expect(response.status).toBe(201)
  return await response.json() as Created
}

interface Visit { hostKey?: string; role?: 'edit' | 'view'; clientId?: string; board?: Board }

/** Opens a connection and returns the first answer: the state, or the refusal. */
async function visit(id: string, options: Visit = {}) {
  const client = new Client(`ws://127.0.0.1:${new URL(base).port}/sync/${id}`)
  clients.push(client)
  await client.opened()
  client.send({ type: 'hello', clientId: options.clientId ?? `c${clients.length}`, seed: options.board ?? seed(), ...(options.hostKey ? { hostKey: options.hostKey } : {}), ...(options.role ? { role: options.role } : {}) })
  const answer = await client.nextOf(['state', 'error'])
  return { client, answer }
}

const stateOf = (answer: ServerMessage) => {
  if (answer.type !== 'state') throw new Error(`Expected a state, got ${JSON.stringify(answer)}`)
  return answer
}
const refusalOf = (answer: ServerMessage) => {
  if (answer.type !== 'error') throw new Error(`Expected a refusal, got ${answer.type}`)
  return answer
}

const ids = (board: Board) => board.objects.map((object) => object.id)

async function postHost(id: string, action: string, hostKey: string | undefined) {
  return fetch(`${base}/sync-api/rooms/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(hostKey ? { hostKey } : {}) })
}

describe('starting rooms', () => {
  it('makes a long random id and a host key, and stores only a hash of the key', async () => {
    const room = await createRoom('solo')
    expect(room.id).toMatch(/^[a-z0-9]{12}$/)
    expect(room.hostKey).toMatch(/^[A-Za-z0-9_-]{20,64}$/)
    const stored = await readFile(path.join(dataDir, 'scenes', room.id, 'room.json'), 'utf8')
    expect(stored).not.toContain(room.hostKey)
    expect(JSON.parse(stored)).toMatchObject({ kind: 'solo', status: 'active', locked: false })
    const other = await createRoom('solo')
    expect(other.id).not.toBe(room.id)
    expect(other.hostKey).not.toBe(room.hostKey)
  })

  it('refuses anything but solo or shared, and a body that is not JSON', async () => {
    for (const body of [{ kind: 'public' }, {}, { kind: 5 }]) {
      const response = await fetch(`${base}/sync-api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      expect(response.status).toBe(400)
    }
    expect((await fetch(`${base}/sync-api/rooms`, { method: 'POST', body: 'not json' })).status).toBe(400)
    expect((await fetch(`${base}/sync-api/rooms`, { method: 'POST', body: 'x'.repeat(5000) })).status).toBe(400)
  })

  it('limits how many rooms one address starts per hour, and how many the server holds', async () => {
    await sync.close()
    await start({ maxCreatesPerHour: 2 })
    await createRoom('solo')
    await createRoom('solo')
    const third = await fetch(`${base}/sync-api/rooms`, { method: 'POST', body: JSON.stringify({ kind: 'solo' }) })
    expect(third.status).toBe(429)
    await sync.close()
    // Two rooms already exist from above; the server holds four.
    await start({ maxScenes: 4 })
    await createRoom('solo')
    await createRoom('shared')
    const full = await fetch(`${base}/sync-api/rooms`, { method: 'POST', body: JSON.stringify({ kind: 'solo' }) })
    expect(full.status).toBe(503)
  })
})

describe('solo simulations', () => {
  it('belong to their owner: the host key opens and seeds the scene', async () => {
    const room = await createRoom('solo')
    const { answer } = await visit(room.id, { hostKey: room.hostKey, board: seed([note('mine')]) })
    const state = stateOf(answer)
    expect(ids(state.board)).toEqual(['mine'])
    expect(state.access).toMatchObject({ kind: 'solo', role: 'edit', host: true })
  })

  it('refuse everyone else, and the refusal is final', async () => {
    const room = await createRoom('solo')
    await visit(room.id, { hostKey: room.hostKey, board: seed([note('mine')]) })
    const { client, answer } = await visit(room.id)
    expect(refusalOf(answer)).toMatchObject({ code: 'forbidden' })
    await client.closed()
    // A wrong key is the same as no key.
    const wrong = await visit(room.id, { hostKey: 'A'.repeat(32) })
    expect(refusalOf(wrong.answer).code).toBe('forbidden')
  })

  it('two people running their own at once never see or change each other’s', async () => {
    const roomA = await createRoom('solo')
    const roomB = await createRoom('solo')
    const a = await visit(roomA.id, { hostKey: roomA.hostKey, board: seed([note('a-start')]) })
    const b = await visit(roomB.id, { hostKey: roomB.hostKey, board: seed([note('b-start')]) })
    a.client.send({ type: 'patch', id: 'pa', on: 'custom', patch: { upserts: [note('a-only', 10)] } })
    b.client.send({ type: 'patch', id: 'pb', on: 'custom', patch: { upserts: [note('b-only', 20)] } })
    await a.client.next('ack')
    await b.client.next('ack')
    expect(ids(sync.rooms.get(roomA.id)!.current.board)).toEqual(['a-start', 'a-only'])
    expect(ids(sync.rooms.get(roomB.id)!.current.board)).toEqual(['b-start', 'b-only'])
    expect(a.client.messages.some((message) => message.type === 'patch')).toBe(false)
    expect(b.client.messages.some((message) => message.type === 'patch')).toBe(false)
    // Two phones in the same classroom can start their own at the same moment: ids never collide and neither overwrites the other.
    const burst = await Promise.all(Array.from({ length: 20 }, () => createRoom('solo')))
    expect(new Set(burst.map((room) => room.id)).size).toBe(20)
  })

  it('let the owner show the scene on a display that can watch but never change it', async () => {
    const room = await createRoom('solo')
    await visit(room.id, { hostKey: room.hostKey, board: seed([note('mine')]) })
    const tv = await visit(room.id, { role: 'view' })
    expect(stateOf(tv.answer).access).toMatchObject({ role: 'view', host: false })
    tv.client.send({ type: 'patch', id: 'tv1', on: 'custom', patch: { upserts: [note('from-tv')] } })
    expect((await tv.client.next('ack')).id).toBe('tv1')
    tv.client.send({ type: 'switch', id: 'tv2', key: 'oceanfront-condo', seed: seed([], 'oceanfront-condo') })
    expect(await tv.client.next('error')).toMatchObject({ code: 'read-only' })
    expect(ids(sync.rooms.get(room.id)!.current.board)).toEqual(['mine'])
  })

  it('keep their saved versions and restore behind the host key', async () => {
    const room = await createRoom('solo')
    const { client } = await visit(room.id, { hostKey: room.hostKey, board: seed([note('mine')]) })
    client.send({ type: 'patch', id: 'p', on: 'custom', patch: { upserts: [note('more')] } })
    await client.next('ack')
    client.close()
    await new Promise((resolve) => setTimeout(resolve, 150))
    expect((await fetch(`${base}/sync-api/scenes/${room.id}/history`)).status).toBe(403)
    const history = await fetch(`${base}/sync-api/scenes/${room.id}/history`, { headers: { 'X-Host-Key': room.hostKey } })
    expect(history.status).toBe(200)
    const items = (await history.json() as { items: Array<{ name: string }> }).items
    const denied = await fetch(`${base}/sync-api/scenes/${room.id}/history/${items[0]!.name}/restore`, { method: 'POST' })
    expect(denied.status).toBe(403)
    const allowed = await fetch(`${base}/sync-api/scenes/${room.id}/history/${items[0]!.name}/restore`, { method: 'POST', headers: { 'X-Host-Key': room.hostKey } })
    expect(allowed.status).toBe(200)
  })
})

describe('rooms that do not exist', () => {
  it('are refused as not found, and visiting an address never creates one', async () => {
    const { client, answer } = await visit('abcdefgh2345')
    expect(refusalOf(answer)).toMatchObject({ code: 'not-found' })
    await client.closed()
    expect(await readdir(path.join(dataDir)).then((names) => names.includes('scenes') ? readdir(path.join(dataDir, 'scenes')) : [])).toEqual([])
    const seeded = await visit('abcdefgh2345', { hostKey: 'B'.repeat(32), board: seed([note('x')]) })
    expect(refusalOf(seeded.answer).code).toBe('not-found')
  })

  it('stay refused when a record exists but cannot be read, instead of opening to anyone', async () => {
    const room = await createRoom('solo')
    await visit(room.id, { hostKey: room.hostKey, board: seed([note('mine')]) })
    await sync.close()
    await writeFile(path.join(dataDir, 'scenes', room.id, 'room.json'), '{not json')
    await start()
    const { answer } = await visit(room.id, { role: 'view' })
    expect(refusalOf(answer).code).toBe('forbidden')
  })
})

describe('shared simulations', () => {
  it('wait for the host to open them, then everyone with the invite sees the same scene', async () => {
    const room = await createRoom('shared')
    const early = await visit(room.id)
    expect(refusalOf(early.answer).code).toBe('not-ready')
    const host = await visit(room.id, { hostKey: room.hostKey, board: seed([note('start')]) })
    expect(stateOf(host.answer).access).toMatchObject({ kind: 'shared', host: true })
    const guest = await visit(room.id, { board: seed([note('ignored')]) })
    const guestState = stateOf(guest.answer)
    expect(ids(guestState.board)).toEqual(['start'])
    expect(guestState.access).toMatchObject({ kind: 'shared', role: 'edit', host: false })
    expect(guestState.peers).toBe(2)
    expect((await host.client.next('presence')).peers).toBe(2)
  })

  it('apply simultaneous edits in one order for everyone', async () => {
    const room = await createRoom('shared')
    const host = await visit(room.id, { hostKey: room.hostKey, board: seed([note('start')]) })
    const guest = await visit(room.id)
    const third = await visit(room.id)
    // Everyone moves the same note and adds their own at the same moment.
    host.client.send({ type: 'patch', id: 'h', on: 'custom', patch: { upserts: [note('start', 100), note('from-host')] } })
    guest.client.send({ type: 'patch', id: 'g', on: 'custom', patch: { upserts: [note('start', 200), note('from-guest')] } })
    third.client.send({ type: 'patch', id: 't', on: 'custom', patch: { upserts: [note('start', 300), note('from-third')] } })
    const acks = await Promise.all([host.client.next('ack'), guest.client.next('ack'), third.client.next('ack')])
    const final = sync.rooms.get(room.id)!.current
    expect(final.version).toBe(3)
    expect(new Set(acks.map((ack) => ack.version))).toEqual(new Set([1, 2, 3]))
    expect(new Set(ids(final.board))).toEqual(new Set(['start', 'from-host', 'from-guest', 'from-third']))
    const serverX = (final.board.objects.find((object) => object.id === 'start') as { x: number }).x
    // Every browser, replaying what it wrote and what the server relayed in version order, ends on the server's board.
    const ownX = [100, 200, 300]
    ;[host, guest, third].forEach((peer, index) => {
      const events = [{ version: acks[index]!.version, x: ownX[index]! }]
      for (const message of peer.client.messages) {
        if (message.type !== 'patch') continue
        const moved = (message.patch.upserts ?? []).find((object) => object.id === 'start') as { x: number } | undefined
        if (moved) events.push({ version: message.version, x: moved.x })
      }
      events.sort((x, y) => x.version - y.version)
      expect(events.at(-1)!.x).toBe(serverX)
    })
  })

  it('keep a third room apart from the first two', async () => {
    const first = await createRoom('shared')
    const second = await createRoom('shared')
    const hostA = await visit(first.id, { hostKey: first.hostKey, board: seed([note('a')]) })
    const hostB = await visit(second.id, { hostKey: second.hostKey, board: seed([note('b')]) })
    const guestA = await visit(first.id)
    hostA.client.send({ type: 'patch', id: '1', on: 'custom', patch: { upserts: [note('a2')] } })
    await guestA.client.next('patch')
    expect(hostB.client.messages.some((message) => message.type === 'patch')).toBe(false)
    expect(ids(sync.rooms.get(second.id)!.current.board)).toEqual(['b'])
  })

  it('count a reconnecting browser once and hand it everything it missed', async () => {
    const room = await createRoom('shared')
    const host = await visit(room.id, { hostKey: room.hostKey, board: seed([note('start')]) })
    const guest = await visit(room.id, { clientId: 'guest-phone' })
    stateOf(guest.answer)
    // The guest's connection dies without a clean close, and the host keeps working.
    host.client.send({ type: 'patch', id: 'h1', on: 'custom', patch: { upserts: [note('while-away')] } })
    await host.client.next('ack')
    const back = await visit(room.id, { clientId: 'guest-phone' })
    const backState = stateOf(back.answer)
    expect(ids(backState.board)).toEqual(['start', 'while-away'])
    expect(backState.peers).toBe(2)
    expect(sync.rooms.get(room.id)!.peers.size).toBe(2)
    await guest.client.closed()
  })

  it('let the host lock the door without removing anyone, and unlock it again', async () => {
    const room = await createRoom('shared')
    const host = await visit(room.id, { hostKey: room.hostKey, board: seed([note('start')]) })
    const guest = await visit(room.id)
    stateOf(guest.answer)
    expect((await postHost(room.id, 'lock', undefined)).status).toBe(403)
    expect((await postHost(room.id, 'lock', 'C'.repeat(32))).status).toBe(403)
    expect((await postHost(room.id, 'lock', room.hostKey)).status).toBe(200)
    expect((await guest.client.next('room')).access).toMatchObject({ locked: true, host: false })
    expect((await host.client.next('room')).access).toMatchObject({ locked: true, host: true })
    const late = await visit(room.id)
    expect(refusalOf(late.answer).code).toBe('locked')
    // Members stay and keep working; the host can still come back in.
    guest.client.send({ type: 'patch', id: 'g', on: 'custom', patch: { upserts: [note('still-here')] } })
    expect((await guest.client.next('ack')).id).toBe('g')
    stateOf((await visit(room.id, { hostKey: room.hostKey })).answer)
    expect((await postHost(room.id, 'unlock', room.hostKey)).status).toBe(200)
    stateOf((await visit(room.id)).answer)
  })

  it('end for everyone on the host’s say-so, keep the work, and reopen for the host only', async () => {
    const room = await createRoom('shared')
    const host = await visit(room.id, { hostKey: room.hostKey, board: seed([note('lesson')]) })
    const guest = await visit(room.id)
    stateOf(guest.answer)
    expect((await postHost(room.id, 'end', undefined)).status).toBe(403)
    expect((await postHost(room.id, 'end', room.hostKey)).status).toBe(200)
    expect((await guest.client.next('room')).access).toMatchObject({ status: 'ended' })
    await guest.client.closed()
    await host.client.closed()

    const late = await visit(room.id)
    expect(refusalOf(late.answer)).toMatchObject({ code: 'ended' })
    const hostLate = await visit(room.id, { hostKey: room.hostKey })
    expect(refusalOf(hostLate.answer).message).toMatch(/reopen/)
    expect((await postHost(room.id, 'reopen', undefined)).status).toBe(403)
    expect((await postHost(room.id, 'lock', room.hostKey)).status).toBe(409)
    expect((await postHost(room.id, 'reopen', room.hostKey)).status).toBe(200)

    const back = await visit(room.id)
    expect(ids(stateOf(back.answer).board)).toEqual(['lesson'])
  })

  it('start private and be shared later by their owner', async () => {
    const room = await createRoom('solo')
    await visit(room.id, { hostKey: room.hostKey, board: seed([note('mine')]) })
    expect((await postHost(room.id, 'lock', room.hostKey)).status).toBe(409)
    expect(refusalOf((await visit(room.id)).answer).code).toBe('forbidden')
    expect((await postHost(room.id, 'share', 'D'.repeat(32))).status).toBe(403)
    expect((await postHost(room.id, 'share', room.hostKey)).status).toBe(200)
    const guest = await visit(room.id)
    expect(stateOf(guest.answer).access).toMatchObject({ kind: 'shared' })
  })

  it('turn people away when full, without ending the room', async () => {
    await sync.close()
    await start({ maxPeersPerRoom: 2 })
    const room = await createRoom('shared')
    await visit(room.id, { hostKey: room.hostKey, board: seed() })
    await visit(room.id)
    const third = await visit(room.id)
    expect(refusalOf(third.answer).code).toBe('full')
  })
})

describe('existing scenes from before rooms had owners', () => {
  it('still open for anyone with the link, are never expired, and cannot be locked or ended by anyone', async () => {
    await new SceneFiles(dataDir).save('main', { board: seed([note('old-work')]), version: 4 })
    const { answer } = await visit('main')
    const state = stateOf(answer)
    expect(ids(state.board)).toEqual(['old-work'])
    expect(state.access).toMatchObject({ kind: 'legacy', role: 'edit', host: false })
    expect((await postHost('main', 'end', 'E'.repeat(32))).status).toBe(404)
    const tv = await visit('main', { role: 'view' })
    expect(stateOf(tv.answer).access).toMatchObject({ kind: 'legacy', role: 'view' })
    // Years later it is still there.
    const files = new SceneFiles(dataDir)
    const old = new Date(Date.now() - 400 * DAY)
    await utimes(path.join(dataDir, 'scenes', 'main', 'current.json'), old, old)
    for (const client of clients.splice(0)) client.close()
    await new Promise((resolve) => setTimeout(resolve, 100))
    await sync.runLifecycle(Date.now() + 400 * DAY)
    expect(await files.load('main')).toBeDefined()
    expect((await stat(path.join(dataDir, 'scenes', 'main'))).isDirectory()).toBe(true)
  })
})

describe('room lifecycle', () => {
  const retention = { soloIdleMs: 10 * DAY, sharedIdleMs: 5 * DAY, endedMs: 2 * DAY }

  it('ends rooms nobody used for a long time, lets the host reopen them, and deletes them after the retention period', async () => {
    await sync.close()
    await start({ retention })
    const solo = await createRoom('solo')
    const shared = await createRoom('shared')
    const soloVisit = await visit(solo.id, { hostKey: solo.hostKey, board: seed([note('solo-work')]) })
    const sharedVisit = await visit(shared.id, { hostKey: shared.hostKey, board: seed([note('class-work')]) })
    soloVisit.client.close()
    sharedVisit.client.close()
    await new Promise((resolve) => setTimeout(resolve, 150))

    const now = Date.now()
    // Six days idle: the shared room (5 days) has expired, the solo room (10 days) has not.
    expect((await sync.runLifecycle(now + 6 * DAY)).ended).toEqual([shared.id])
    expect(refusalOf((await visit(shared.id)).answer).message).toMatch(/expired/)
    expect(refusalOf((await visit(shared.id, { hostKey: shared.hostKey })).answer).message).toMatch(/reopen/)
    stateOf((await visit(solo.id, { hostKey: solo.hostKey })).answer)

    // The host reopens it and the work is intact.
    expect((await postHost(shared.id, 'reopen', shared.hostKey)).status).toBe(200)
    expect(ids(stateOf((await visit(shared.id)).answer).board)).toEqual(['class-work'])

    // An ended room nobody reopens is deleted after the retention period.
    for (const client of clients.splice(0)) client.close()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const later = now + 30 * DAY
    expect((await sync.runLifecycle(later)).ended.sort()).toEqual([shared.id, solo.id].sort())
    expect((await sync.runLifecycle(later + 1 * DAY)).deleted).toEqual([])
    expect((await sync.runLifecycle(later + 3 * DAY)).deleted.sort()).toEqual([shared.id, solo.id].sort())
    expect(await stat(path.join(dataDir, 'scenes', solo.id)).catch(() => undefined)).toBeUndefined()
    expect(refusalOf((await visit(solo.id, { hostKey: solo.hostKey })).answer).code).toBe('not-found')
  })

  it('leaves a room alone while someone is in it', async () => {
    await sync.close()
    await start({ retention })
    const room = await createRoom('shared')
    await visit(room.id, { hostKey: room.hostKey, board: seed() })
    expect((await sync.runLifecycle(Date.now() + 100 * DAY)).ended).toEqual([])
    expect((await sync.registry.get(room.id))?.status).toBe('active')
  })

  it('counts use: opening and editing keep a room alive', async () => {
    await sync.close()
    await start({ retention })
    const room = await createRoom('solo')
    const { client } = await visit(room.id, { hostKey: room.hostKey, board: seed() })
    client.send({ type: 'patch', id: 'p', on: 'custom', patch: { upserts: [note('x')] } })
    await client.next('ack')
    client.close()
    await new Promise((resolve) => setTimeout(resolve, 150))
    // Nine days later is inside the ten-day limit.
    expect((await sync.runLifecycle(Date.now() + 9 * DAY)).ended).toEqual([])
  })
})

describe('access summary shape', () => {
  it('is the same object the browser reads', async () => {
    const room = await createRoom('shared')
    const { answer } = await visit(room.id, { hostKey: room.hostKey, board: seed() })
    const access: RoomAccess | undefined = stateOf(answer).access
    expect(access).toEqual({ kind: 'shared', role: 'edit', host: true, locked: false, status: 'active' })
  })
})
