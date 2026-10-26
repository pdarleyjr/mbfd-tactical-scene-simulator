import { applyScenePatch, isEmptyPatch, MAX_SCENE_OBJECTS, sceneIdSchema, type Board, type ScenePatch, type ServerMessage } from '@mbfd/domain'
import type { SceneFiles } from './files.js'

/** A connected browser, reduced to what a room needs. */
export interface Peer {
  id: string
  send(message: ServerMessage): void
}

export interface RoomTiming {
  saveDelayMs: number
  /** Continuous editing still saves at least this often. */
  saveMaxWaitMs?: number
  snapshotEveryMs: number
  idleEvictMs: number
}

export const defaultTiming: RoomTiming = { saveDelayMs: 600, saveMaxWaitMs: 5000, snapshotEveryMs: 5 * 60_000, idleEvictMs: 10 * 60_000 }

/**
 * One live scene. The room holds the authoritative board, applies patches in
 * arrival order (last write wins per object), relays them to everyone else,
 * saves shortly after changes, and keeps automatic snapshots.
 */
export class Room {
  readonly peers = new Set<Peer>()
  private saveTimer: ReturnType<typeof setTimeout> | undefined
  private firstUnsavedAt: number | undefined
  private lastSnapshotAt = Date.now()
  private lastSnapshotVersion: number

  constructor(
    readonly id: string,
    private board: Board,
    private version: number,
    private readonly files: SceneFiles,
    private readonly timing: RoomTiming = defaultTiming,
  ) {
    this.lastSnapshotVersion = version
  }

  get current() {
    return { board: this.board, version: this.version }
  }

  join(peer: Peer) {
    this.peers.add(peer)
    peer.send({ type: 'state', board: this.board, version: this.version, now: Date.now(), peers: this.peers.size })
    this.broadcast({ type: 'presence', peers: this.peers.size }, peer)
  }

  leave(peer: Peer) {
    if (!this.peers.delete(peer)) return
    this.broadcast({ type: 'presence', peers: this.peers.size })
    if (this.peers.size === 0) this.flushSafely('Last person left')
  }

  applyPatch(peer: Peer, opId: string, patch: ScenePatch) {
    if (!isEmptyPatch(patch)) {
      const next = applyScenePatch(this.board, patch)
      if (next.objects.length > MAX_SCENE_OBJECTS) {
        peer.send({ type: 'error', id: opId, message: `A scene can hold up to ${MAX_SCENE_OBJECTS} objects. That change was not applied.` })
        return
      }
      this.board = next
      this.version += 1
      this.broadcast({ type: 'patch', from: peer.id, version: this.version, patch }, peer)
      this.scheduleSave()
    }
    peer.send({ type: 'ack', id: opId, version: this.version })
  }

  /** Whole-scene replacement, used when a saved version is restored. */
  async replace(from: string, board: Board, reason: string) {
    await this.snapshotNow(`Before ${reason.toLowerCase()}`)
    this.board = { ...board, id: this.board.id, updatedAt: new Date().toISOString() }
    this.version += 1
    this.broadcast({ type: 'replace', from, version: this.version, board: this.board })
    this.scheduleSave()
    return this.version
  }

  broadcast(message: ServerMessage, except?: Peer) {
    for (const peer of this.peers) if (peer !== except) peer.send(message)
  }

  private scheduleSave() {
    const now = Date.now()
    this.firstUnsavedAt ??= now
    if (this.saveTimer) clearTimeout(this.saveTimer)
    const overdue = now - this.firstUnsavedAt >= (this.timing.saveMaxWaitMs ?? Number.POSITIVE_INFINITY)
    this.saveTimer = setTimeout(() => this.flushSafely(), overdue ? 0 : this.timing.saveDelayMs)
  }

  private flushSafely(reason?: string) {
    this.flush(reason).catch((error: unknown) => console.error(`Saving scene ${this.id} failed`, error))
  }

  /** Saves now, and snapshots when the periodic interval has passed. */
  async flush(snapshotReason?: string) {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = undefined }
    this.firstUnsavedAt = undefined
    await this.files.save(this.id, this.current)
    const due = Date.now() - this.lastSnapshotAt >= this.timing.snapshotEveryMs
    if (this.version !== this.lastSnapshotVersion && (due || snapshotReason)) await this.snapshotNow(snapshotReason ?? 'Automatic')
  }

  async snapshotNow(reason: string) {
    await this.files.snapshot(this.id, this.current, reason)
    this.lastSnapshotAt = Date.now()
    this.lastSnapshotVersion = this.version
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>()
  private readonly loading = new Map<string, Promise<Room>>()
  private readonly idleSince = new Map<string, number>()

  constructor(private readonly files: SceneFiles, private readonly timing: RoomTiming = defaultTiming, private readonly maxScenes = 500) {}

  /** Opens a scene, creating it from the visitor's seed the first time. */
  async open(id: string, seed: Board): Promise<Room> {
    sceneIdSchema.parse(id)
    const existing = this.rooms.get(id)
    if (existing) return existing
    const pending = this.loading.get(id)
    if (pending) return pending
    const created = (async () => {
      const stored = await this.files.load(id)
      if (!stored && (await this.files.sceneCount()) >= this.maxScenes) throw new Error('This server has reached its scene limit.')
      const room = new Room(id, stored?.board ?? seed, stored?.version ?? 0, this.files, this.timing)
      if (!stored) await room.flush()
      this.rooms.set(id, room)
      return room
    })()
    this.loading.set(id, created)
    try { return await created } finally { this.loading.delete(id) }
  }

  get(id: string): Room | undefined {
    return this.rooms.get(id)
  }

  /** Drops rooms nobody has used for a while; their state is already saved. */
  async evictIdle(now = Date.now()) {
    for (const [id, room] of this.rooms) {
      if (room.peers.size) { this.idleSince.delete(id); continue }
      const since = this.idleSince.get(id) ?? now
      this.idleSince.set(id, since)
      if (now - since < this.timing.idleEvictMs) continue
      await room.flush()
      // Someone may have joined while it was saving.
      if (room.peers.size) { this.idleSince.delete(id); continue }
      this.rooms.delete(id)
      this.idleSince.delete(id)
    }
  }

  async flushAll() {
    for (const room of this.rooms.values()) await room.flush('Server stopping')
  }
}
