import type { Board } from '@mbfd/domain'

/**
 * Device-local persistence. Boards, uploaded media, and preferences live in
 * this browser's IndexedDB. Nothing here synchronizes between devices; moving
 * work to another device is done with exported scene files.
 *
 * When IndexedDB is unavailable (some private-browsing modes) the store falls
 * back to memory and reports `durable: false` so the UI can say so plainly.
 */

export interface BoardRecord {
  id: string
  board: Board
  thumbnail?: string | undefined
}

export interface BoardSummary {
  id: string
  name: string
  templateId: string | null
  updatedAt: string
  objectCount: number
  thumbnail?: string | undefined
}

export interface MediaRecord {
  id: string
  blob: Blob
  mimeType: string
  name: string
}

export interface SceneStorage {
  durable: boolean
  listBoards(): Promise<BoardSummary[]>
  getBoard(id: string): Promise<BoardRecord | undefined>
  putBoard(board: Board, thumbnail?: string): Promise<void>
  setThumbnail(id: string, thumbnail: string): Promise<void>
  deleteBoard(id: string): Promise<void>
  getMedia(id: string): Promise<MediaRecord | undefined>
  putMedia(record: MediaRecord): Promise<void>
  getMeta<T>(key: string): Promise<T | undefined>
  setMeta(key: string, value: unknown): Promise<void>
}

const DB_NAME = 'mbfd-tactical-scene-simulator'
const DB_VERSION = 1

function summarize(record: BoardRecord): BoardSummary {
  return { id: record.id, name: record.board.name, templateId: record.board.templateId, updatedAt: record.board.updatedAt, objectCount: record.board.objects.length, thumbnail: record.thumbnail }
}

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result)
    operation.onerror = () => reject(operation.error ?? new Error('Storage request failed.'))
  })
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = factory.open(DB_NAME, DB_VERSION)
    opening.onupgradeneeded = () => {
      const database = opening.result
      if (!database.objectStoreNames.contains('boards')) database.createObjectStore('boards', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('media')) database.createObjectStore('media', { keyPath: 'id' })
      if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta')
    }
    opening.onsuccess = () => resolve(opening.result)
    opening.onerror = () => reject(opening.error ?? new Error('Could not open browser storage.'))
    opening.onblocked = () => reject(new Error('Browser storage is blocked by another open tab.'))
  })
}

export function createIndexedDbStorage(database: IDBDatabase): SceneStorage {
  function store(name: 'boards' | 'media' | 'meta', mode: IDBTransactionMode = 'readonly') {
    return database.transaction(name, mode).objectStore(name)
  }
  return {
    durable: true,
    async listBoards() {
      const records = await request(store('boards').getAll() as IDBRequest<BoardRecord[]>)
      return records.map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    },
    getBoard: (id) => request(store('boards').get(id) as IDBRequest<BoardRecord | undefined>),
    async putBoard(board, thumbnail) {
      const existing = thumbnail === undefined ? await request(store('boards').get(board.id) as IDBRequest<BoardRecord | undefined>) : undefined
      await request(store('boards', 'readwrite').put({ id: board.id, board, thumbnail: thumbnail ?? existing?.thumbnail } satisfies BoardRecord))
    },
    setThumbnail(id, thumbnail) {
      // One readwrite transaction, so a concurrent autosave cannot be overwritten.
      return new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('boards', 'readwrite')
        const boards = transaction.objectStore('boards')
        const lookup = boards.get(id) as IDBRequest<BoardRecord | undefined>
        lookup.onsuccess = () => { if (lookup.result) boards.put({ ...lookup.result, thumbnail }) }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the thumbnail.'))
      })
    },
    async deleteBoard(id) { await request(store('boards', 'readwrite').delete(id)) },
    getMedia: (id) => request(store('media').get(id) as IDBRequest<MediaRecord | undefined>),
    async putMedia(record) { await request(store('media', 'readwrite').put(record)) },
    getMeta: <T,>(key: string) => request(store('meta').get(key) as IDBRequest<T | undefined>),
    async setMeta(key, value) { await request(store('meta', 'readwrite').put(value, key)) },
  }
}

export function createMemoryStorage(): SceneStorage {
  const boards = new Map<string, BoardRecord>()
  const media = new Map<string, MediaRecord>()
  const meta = new Map<string, unknown>()
  return {
    durable: false,
    async listBoards() { return [...boards.values()].map(summarize).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) },
    async getBoard(id) { return boards.get(id) },
    async putBoard(board, thumbnail) { boards.set(board.id, { id: board.id, board, thumbnail: thumbnail ?? boards.get(board.id)?.thumbnail }) },
    async setThumbnail(id, thumbnail) { const record = boards.get(id); if (record) boards.set(id, { ...record, thumbnail }) },
    async deleteBoard(id) { boards.delete(id) },
    async getMedia(id) { return media.get(id) },
    async putMedia(record) { media.set(record.id, record) },
    async getMeta<T>(key: string) { return meta.get(key) as T | undefined },
    async setMeta(key, value) { meta.set(key, value) },
  }
}

export async function openSceneStorage(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<SceneStorage> {
  if (!factory) return createMemoryStorage()
  try {
    return createIndexedDbStorage(await openDatabase(factory))
  } catch (error) {
    console.warn('Falling back to memory storage', error)
    return createMemoryStorage()
  }
}

/** Asks the browser not to evict saved boards under storage pressure. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
