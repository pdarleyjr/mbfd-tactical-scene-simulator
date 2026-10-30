import { applyScenePatch, isEmptyPatch, MAX_SCENE_OBJECTS, scenarioKey, sceneIdSchema, type Board, type RoomAccess, type ScenePatch, type ServerMessage } from '@mbfd/domain'
import type { SceneFiles } from './files.js'

/** A connected browser, reduced to what a room needs. */
export interface Peer {
  id: string
  send(message: ServerMessage): void
  /** What this connection may do in the room. Missing means a plain editor. */
  access?: RoomAccess | undefined
  /** Ends the connection. Used when the same browser reconnects or the host ends the room. */
  close?(): void
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
  private swapping: Promise<unknown> = Promise.resolve()

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
    // A browser that reconnects before its old socket is noticed as dead replaces it, so it is never counted twice.
    for (const existing of this.peers) {
      if (existing.id !== peer.id) continue
      this.peers.delete(existing)
      existing.close?.()
    }
    this.peers.add(peer)
    peer.send({ type: 'state', board: this.board, version: this.version, now: Date.now(), peers: this.peers.size, ...(peer.access ? { access: peer.access } : {}) })
    this.broadcast({ type: 'presence', peers: this.peers.size }, peer)
  }

  leave(peer: Peer) {
    if (!this.peers.delete(peer)) return
    this.broadcast({ type: 'presence', peers: this.peers.size })
    if (this.peers.size === 0) this.flushSafely('Last person left')
  }

  applyPatch(peer: Peer, opId: string, patch: ScenePatch, on: string) {
    // Made on a scenario the scene has since switched away from: drop it rather than mix scenarios.
    const stale = on !== scenarioKey(this.board)
    if (!stale && !isEmptyPatch(patch)) {
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

  /** Whole-board swaps (restore, switch) run one at a time. */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.swapping.catch(() => undefined).then(task)
    this.swapping = run
    return run
  }

  /**
   * Swaps in a whole board for everyone. The swap and broadcast happen in one
   * step so no change can slip in between. When the scenario changes, the
   * previous board is parked under its own scenario first (queued before any
   * wait, so it is written even if the snapshot fails). The snapshot is
   * best-effort and skipped when nothing changed since the last one.
   */
  private async swap(from: string, board: Board, reason: 'restore' | 'switch', snapshotReason: string) {
    const previous = this.current
    const unsnapshotted = previous.version !== this.lastSnapshotVersion
    this.board = { ...board, id: this.board.id, updatedAt: new Date().toISOString() }
    this.version += 1
    this.broadcast({ type: 'replace', from, version: this.version, board: this.board, reason })
    this.scheduleSave()
    const parking = scenarioKey(previous.board) !== scenarioKey(board) ? this.files.park(this.id, scenarioKey(previous.board), previous.board) : undefined
    if (unsnapshotted || reason === 'restore') {
      await this.files.snapshot(this.id, previous, snapshotReason).then(
        () => { this.lastSnapshotAt = Date.now() },
        (error: unknown) => console.error(`Snapshot before ${reason} failed for scene ${this.id}`, error),
      )
    }
    await parking
  }

  /** Puts a saved version back for everyone. A different scenario's work is parked, not lost. */
  replace(from: string, board: Board, reason: string) {
    return this.exclusive(async () => {
      await this.swap(from, board, 'restore', `Before ${reason.toLowerCase()}`)
      return this.version
    })
  }

  /**
   * Switches everyone to another scenario. The current one is parked and comes
   * back exactly as it was when someone switches back; a scenario never opened
   * here before starts from `seed` (its original template).
   */
  switchScenario(from: string, key: string, seed: Board) {
    return this.exclusive(async () => {
      if (key === scenarioKey(this.board)) return this.version
      const target = (await this.files.loadParked(this.id, key)) ?? seed
      await this.swap(from, target, 'switch', `Before switching to ${target.scenario.title}`.slice(0, 160))
      return this.version
    })
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
  private readonly loading = new Map<string, Promise<Room | undefined>>()
  private readonly idleSince = new Map<string, number>()

  constructor(private readonly files: SceneFiles, private readonly timing: RoomTiming = defaultTiming, private readonly maxScenes = 1000) {}

  /**
   * Opens a scene that already exists, or creates it from `seed` when it has
   * no saved board yet. Whether a visitor may do either is decided before this
   * is called (see RoomRegistry.decide); with no seed, a missing scene is not created.
   */
  async open(id: string, seed?: Board): Promise<Room | undefined> {
    sceneIdSchema.parse(id)
    const existing = this.rooms.get(id)
    if (existing) return existing
    const pending = this.loading.get(id)
    if (pending) return pending
    const created = (async (): Promise<Room | undefined> => {
      const stored = await this.files.load(id)
      const board = stored?.board ?? seed
      if (!board) return undefined
      // Rooms are made by RoomRegistry.create, which enforces the scene limit; this guards the legacy path.
      if (!stored && !(await this.files.hasFolder(id)) && (await this.files.sceneCount()) >= this.maxScenes) throw new Error('This server has reached its scene limit.')
      const room = new Room(id, board, stored?.version ?? 0, this.files, this.timing)
      if (!stored) await room.flush()
      this.rooms.set(id, room)
      return room
    })()
    this.loading.set(id, created)
    try { return await created } finally { this.loading.delete(id) }
  }

  /** Saves a room and forgets it, so the next visit reloads it from disk. Used when a room ends or is reopened. */
  async drop(id: string) {
    const room = this.rooms.get(id)
    if (!room) return
    await room.flush('Room closed')
    this.rooms.delete(id)
    this.idleSince.delete(id)
  }

  /** Whether a saved scene exists, in memory or on disk. */
  async exists(id: string): Promise<boolean> {
    return this.rooms.has(id) || (await this.files.load(id)) !== undefined
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
