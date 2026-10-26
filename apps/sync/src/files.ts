import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { boardSchema, sceneIdSchema, type Board } from '@mbfd/domain'

/**
 * Scene persistence on disk, one folder per scene:
 *   scenes/<id>/current.json        the live board and its version
 *   scenes/<id>/history/<stamp>.json automatic snapshots, newest kept
 * Writes go to a temporary file first and are renamed into place, so a crash
 * can never leave a half-written scene. Writes to one scene run one at a time.
 */

export const HISTORY_LIMIT = 100

export interface StoredScene {
  board: Board
  version: number
}

export interface HistoryEntry {
  name: string
  savedAt: string
  version: number
  reason: string
  objectCount: number
}

async function writeAtomic(file: string, text: string) {
  const temporary = `${file}.${randomUUID()}.tmp`
  await writeFile(temporary, text, 'utf8')
  await rename(temporary, file)
}

export class SceneFiles {
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(private readonly root: string) {}

  /** Runs writes for one scene in order, so a save and a snapshot never interleave. */
  private queue<T>(id: string, task: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(id) ?? Promise.resolve()).catch(() => undefined).then(task)
    this.queues.set(id, run)
    void run.catch(() => undefined).finally(() => { if (this.queues.get(id) === run) this.queues.delete(id) })
    return run
  }

  private folder(id: string) {
    return path.join(this.root, 'scenes', sceneIdSchema.parse(id))
  }

  async load(id: string): Promise<StoredScene | undefined> {
    try {
      const raw = JSON.parse(await readFile(path.join(this.folder(id), 'current.json'), 'utf8')) as { board: unknown; version: unknown }
      const board = boardSchema.safeParse(raw.board)
      if (!board.success) return undefined
      return { board: board.data, version: typeof raw.version === 'number' ? raw.version : 0 }
    } catch {
      return undefined
    }
  }

  save(id: string, scene: StoredScene) {
    const folder = this.folder(id)
    return this.queue(id, async () => {
      await mkdir(folder, { recursive: true })
      await writeAtomic(path.join(folder, 'current.json'), JSON.stringify(scene))
    })
  }

  snapshot(id: string, scene: StoredScene, reason: string) {
    const folder = path.join(this.folder(id), 'history')
    return this.queue(id, () => this.writeSnapshot(folder, scene, reason))
  }

  private async writeSnapshot(folder: string, scene: StoredScene, reason: string) {
    await mkdir(folder, { recursive: true })
    const savedAt = new Date().toISOString()
    const name = `${savedAt.replace(/[:.]/g, '-')}-v${scene.version}`
    await writeAtomic(path.join(folder, `${name}.json`), JSON.stringify({ ...scene, savedAt, reason }))
    const files = (await readdir(folder)).filter((file) => file.endsWith('.json')).sort()
    for (const old of files.slice(0, Math.max(0, files.length - HISTORY_LIMIT))) await rm(path.join(folder, old), { force: true })
  }

  async history(id: string): Promise<HistoryEntry[]> {
    const folder = path.join(this.folder(id), 'history')
    let files: string[]
    try { files = (await readdir(folder)).filter((file) => file.endsWith('.json')).sort().reverse() } catch { return [] }
    const entries: HistoryEntry[] = []
    for (const file of files) {
      try {
        const raw = JSON.parse(await readFile(path.join(folder, file), 'utf8')) as { savedAt?: string; version?: number; reason?: string; board?: { objects?: unknown[] } }
        entries.push({ name: file.replace(/\.json$/, ''), savedAt: raw.savedAt ?? '', version: raw.version ?? 0, reason: raw.reason ?? '', objectCount: raw.board?.objects?.length ?? 0 })
      } catch { /* skip unreadable snapshot */ }
    }
    return entries
  }

  async loadSnapshot(id: string, name: string): Promise<Board | undefined> {
    if (!/^[\w-]{1,80}$/.test(name)) return undefined
    try {
      const raw = JSON.parse(await readFile(path.join(this.folder(id), 'history', `${name}.json`), 'utf8')) as { board: unknown }
      const board = boardSchema.safeParse(raw.board)
      return board.success ? board.data : undefined
    } catch {
      return undefined
    }
  }

  async sceneCount(): Promise<number> {
    try { return (await readdir(path.join(this.root, 'scenes'))).length } catch { return 0 }
  }
}
