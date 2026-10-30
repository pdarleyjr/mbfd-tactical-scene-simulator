import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { newSceneId, ROOM_ID_LENGTH, type RoomAccess, type RoomDenial, type RoomRole } from '@mbfd/domain'
import { writeAtomic, type SceneFiles } from './files.js'

/**
 * Who may open which room.
 *
 * There are no accounts. A room made from the start screen has a random id
 * (the invitation) and a host key the creator's browser keeps. Only the hash of
 * the host key is stored. Rooms made before this existed have no record at all
 * and keep working exactly as before (anyone with the link can edit, nothing
 * expires), so existing shared scenes are never locked out or deleted.
 *
 *   solo    private: only the host key opens it for editing; the classroom
 *           display link (view only) is the one thing anyone with the id may open.
 *   shared  anyone with the invite link joins; the host can lock it, end it, and reopen it.
 *
 * Lifecycle: a room nobody has used for a while ends (recoverable by the host),
 * and an ended room is deleted after a retention period.
 */

export type StoredKind = 'solo' | 'shared'

export interface RoomMeta {
  v: 1
  kind: StoredKind
  hostKeyHash: string
  createdAt: string
  touchedAt: string
  locked: boolean
  status: 'active' | 'ended'
  endedAt?: string
  endedReason?: 'host' | 'expired'
}

function parseMeta(raw: unknown): RoomMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const m = raw as Record<string, unknown>
  const text = (value: unknown): value is string => typeof value === 'string'
  if (m.v !== 1 || (m.kind !== 'solo' && m.kind !== 'shared') || !text(m.hostKeyHash) || !/^[0-9a-f]{64}$/.test(m.hostKeyHash)) return undefined
  if (!text(m.createdAt) || !text(m.touchedAt) || typeof m.locked !== 'boolean' || (m.status !== 'active' && m.status !== 'ended')) return undefined
  return {
    v: 1, kind: m.kind, hostKeyHash: m.hostKeyHash, createdAt: m.createdAt, touchedAt: m.touchedAt, locked: m.locked, status: m.status,
    ...(text(m.endedAt) ? { endedAt: m.endedAt } : {}),
    ...(m.endedReason === 'host' || m.endedReason === 'expired' ? { endedReason: m.endedReason } : {}),
  }
}

export interface Retention {
  /** A private simulation nobody opened or edited for this long ends. */
  soloIdleMs: number
  sharedIdleMs: number
  /** An ended room can be reopened by its host for this long, then it is deleted. */
  endedMs: number
}

const DAY = 24 * 60 * 60_000
export const defaultRetention: Retention = { soloIdleMs: 60 * DAY, sharedIdleMs: 30 * DAY, endedMs: 7 * DAY }

const FILE = 'room.json'

const hashKey = (key: string) => createHash('sha256').update(key).digest()

/** The record could not be read. Callers refuse the connection instead of treating the room as open. */
export class RoomRecordError extends Error {}

export const denialText: Record<RoomDenial, string> = {
  'not-found': 'That simulation was not found. It may have expired, or the link may be wrong.',
  forbidden: 'This is a private simulation. Only its owner can open it.',
  locked: 'The host has locked this simulation, so no one new can join right now.',
  ended: 'The host ended this simulation.',
  'not-ready': 'The host has not opened this simulation yet. This page joins as soon as they do.',
  full: 'This simulation is full.',
}

export type Decision = { ok: true; access: RoomAccess } | { ok: false; code: RoomDenial; message: string }

export class RoomRegistry {
  private readonly cache = new Map<string, RoomMeta>()
  private tail: Promise<unknown> = Promise.resolve()

  constructor(private readonly files: SceneFiles, readonly retention: Retention = defaultRetention) {}

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = this.tail.catch(() => undefined).then(task)
    this.tail = run
    return run
  }

  private file(id: string) {
    return path.join(this.files.roomFolder(id), FILE)
  }

  /** The room's record, or undefined for a room that predates records (legacy). Throws when a record exists but cannot be read. */
  async get(id: string): Promise<RoomMeta | undefined> {
    const cached = this.cache.get(id)
    if (cached) return cached
    let text: string
    try {
      text = await readFile(this.file(id), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw new RoomRecordError(`Room ${id} record could not be read`)
    }
    const parsed = parseMeta(safeJson(text))
    if (!parsed) throw new RoomRecordError(`Room ${id} record is damaged`)
    this.cache.set(id, parsed)
    return parsed
  }

  /** Makes a new empty room and returns its id and the only copy of its host key. */
  create(kind: StoredKind, maxScenes: number): Promise<{ id: string; hostKey: string } | { error: 'full' }> {
    return this.serialized(async () => {
      if ((await this.files.sceneCount()) >= maxScenes) return { error: 'full' as const }
      await mkdir(this.files.scenesFolder(), { recursive: true })
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const id = newSceneId(() => randomInt(0, 2 ** 32) / 2 ** 32, ROOM_ID_LENGTH)
        try { await mkdir(this.files.roomFolder(id)) } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue
          throw error
        }
        const hostKey = randomBytes(24).toString('base64url')
        const now = new Date().toISOString()
        const meta: RoomMeta = { v: 1, kind, hostKeyHash: hashKey(hostKey).toString('hex'), createdAt: now, touchedAt: now, locked: false, status: 'active' }
        await writeAtomic(this.file(id), JSON.stringify(meta))
        this.cache.set(id, meta)
        return { id, hostKey }
      }
      throw new Error('Could not find a free room id')
    })
  }

  verifyHost(meta: RoomMeta, key: string | undefined): boolean {
    if (!key) return false
    const expected = Buffer.from(meta.hostKeyHash, 'hex')
    return timingSafeEqual(hashKey(key), expected)
  }

  /** Changes a room's record under a lock. `change` returns the new record, or undefined to leave it. */
  mutate(id: string, change: (meta: RoomMeta) => RoomMeta | undefined): Promise<RoomMeta | undefined> {
    return this.serialized(async () => {
      const meta = await this.get(id)
      if (!meta) return undefined
      const next = change(meta)
      if (!next) return meta
      await writeAtomic(this.file(id), JSON.stringify(next))
      this.cache.set(id, next)
      return next
    })
  }

  /** Records use so an active room is not expired. Writes at most every `minGapMs`. */
  async touch(id: string, now = Date.now(), minGapMs = 10 * 60_000) {
    const meta = await this.get(id)
    if (!meta || meta.status !== 'active' || now - (Date.parse(meta.touchedAt) || 0) < minGapMs) return
    await this.mutate(id, (current) => ({ ...current, touchedAt: new Date(now).toISOString() }))
  }

  /**
   * Ends rooms nobody has used for a long time (their host can still reopen
   * them) and deletes rooms that stayed ended past the retention period.
   * Rooms without a record (legacy) are never touched. Rooms with someone in
   * them are skipped.
   */
  async sweep(now: number, isOpen: (id: string) => boolean, release: (id: string) => Promise<void> = async () => undefined): Promise<{ ended: string[]; deleted: string[] }> {
    const ended: string[] = []
    const deleted: string[] = []
    for (const id of await this.files.sceneIds()) {
      let meta: RoomMeta | undefined
      try { meta = await this.get(id) } catch (error) { console.error('Lifecycle sweep skipped a room', error); continue }
      if (!meta || isOpen(id)) continue
      if (meta.status === 'active') {
        const last = Math.max(Date.parse(meta.touchedAt) || 0, await this.files.savedAt(id))
        const limit = meta.kind === 'solo' ? this.retention.soloIdleMs : this.retention.sharedIdleMs
        if (now - last <= limit) continue
        await release(id)
        await this.mutate(id, (current) => current.status === 'active' ? { ...current, status: 'ended', endedAt: new Date(now).toISOString(), endedReason: 'expired' } : undefined)
        ended.push(id)
      } else if (now - (Date.parse(meta.endedAt ?? '') || now) > this.retention.endedMs) {
        await release(id)
        await this.files.remove(id)
        this.cache.delete(id)
        deleted.push(id)
      }
    }
    return { ended, deleted }
  }

  /**
   * Decides what a connection may do. `hasBoard` says whether the room already
   * has a saved scene. A room with no record is a legacy shared scene: open to
   * anyone with the link, but never created by visiting an address.
   */
  async decide(id: string, request: { hostKey?: string | undefined; role?: RoomRole | undefined }, hasBoard: boolean): Promise<Decision> {
    const deny = (code: RoomDenial, message = denialText[code]): Decision => ({ ok: false, code, message })
    let meta: RoomMeta | undefined
    try { meta = await this.get(id) } catch { return deny('forbidden', 'This simulation could not be checked right now, so it was not opened.') }
    const role: RoomRole = request.role ?? 'edit'
    if (!meta) {
      if (!hasBoard) return deny('not-found')
      return { ok: true, access: { kind: 'legacy', role, host: false, locked: false, status: 'active' } }
    }
    const host = this.verifyHost(meta, request.hostKey)
    if (meta.status === 'ended') {
      const expired = meta.endedReason === 'expired'
      const base = expired ? 'This simulation expired after a long time without use.' : denialText.ended
      return deny('ended', host ? `${base} You are the host, so you can reopen it.` : base)
    }
    if (meta.kind === 'solo' && !host && role !== 'view') return deny('forbidden')
    if (meta.kind === 'shared' && meta.locked && !host) return deny('locked')
    if (!hasBoard && !host) return deny('not-ready')
    return { ok: true, access: { kind: meta.kind, role, host, locked: meta.locked, status: meta.status } }
  }
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text) } catch { return undefined }
}
