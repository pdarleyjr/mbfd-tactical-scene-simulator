import { afterEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { Board } from '@mbfd/domain'
import { boardFromTemplate } from '../templates'
import { createMemoryStorage, openSceneStorage, requestPersistentStorage, type SceneStorage } from './storage'

function board(name: string, updatedAt: string): Board {
  return { ...boardFromTemplate(), name, updatedAt }
}

const implementations: Array<[string, () => Promise<SceneStorage>, boolean]> = [
  ['memory', async () => createMemoryStorage(), false],
  ['IndexedDB', () => openSceneStorage(new IDBFactory()), true],
]

describe.each(implementations)('%s storage', (_name, open, durable) => {
  it('reports whether it is durable', async () => {
    expect((await open()).durable).toBe(durable)
  })

  it('stores and reads boards', async () => {
    const storage = await open()
    const saved = board('Drill', '2026-10-25T12:00:00.000Z')
    await storage.putBoard(saved)
    const record = await storage.getBoard(saved.id)
    expect(record?.id).toBe(saved.id)
    expect(record?.board).toEqual(saved)
    expect(await storage.getBoard('missing')).toBeUndefined()
  })

  it('lists summaries newest first', async () => {
    const storage = await open()
    const older = board('Older', '2026-10-24T08:00:00.000Z')
    const newest = board('Newest', '2026-10-25T09:00:00.000Z')
    const middle = board('Middle', '2026-10-25T08:00:00.000Z')
    for (const item of [older, newest, middle]) await storage.putBoard(item)
    const summaries = await storage.listBoards()
    expect(summaries.map((summary) => summary.name)).toEqual(['Newest', 'Middle', 'Older'])
    expect(summaries[0]).toEqual({ id: newest.id, name: 'Newest', templateId: 'waterfront-estate', updatedAt: newest.updatedAt, objectCount: newest.objects.length, thumbnail: undefined })
  })

  it('keeps the thumbnail when a board is saved without one', async () => {
    const storage = await open()
    const saved = board('Drill', '2026-10-25T12:00:00.000Z')
    await storage.putBoard(saved, 'data:image/png;base64,first')
    await storage.putBoard({ ...saved, name: 'Renamed' })
    expect(await storage.getBoard(saved.id)).toMatchObject({ thumbnail: 'data:image/png;base64,first', board: { name: 'Renamed' } })
    await storage.putBoard(saved, 'data:image/png;base64,second')
    expect((await storage.getBoard(saved.id))?.thumbnail).toBe('data:image/png;base64,second')
    expect((await storage.listBoards())[0]?.thumbnail).toBe('data:image/png;base64,second')
  })

  it('sets thumbnails only on existing boards', async () => {
    const storage = await open()
    const saved = board('Drill', '2026-10-25T12:00:00.000Z')
    await storage.putBoard(saved)
    await storage.setThumbnail(saved.id, 'data:image/png;base64,thumb')
    await storage.setThumbnail('missing', 'data:image/png;base64,thumb')
    expect((await storage.getBoard(saved.id))?.thumbnail).toBe('data:image/png;base64,thumb')
    expect(await storage.getBoard('missing')).toBeUndefined()
  })

  it('deletes boards', async () => {
    const storage = await open()
    const saved = board('Drill', '2026-10-25T12:00:00.000Z')
    await storage.putBoard(saved)
    await storage.deleteBoard(saved.id)
    expect(await storage.getBoard(saved.id)).toBeUndefined()
    expect(await storage.listBoards()).toEqual([])
  })

  it('stores media', async () => {
    const storage = await open()
    await storage.putMedia({ id: 'm1', blob: new Blob(['image-bytes'], { type: 'image/png' }), mimeType: 'image/png', name: 'aerial.png' })
    const media = await storage.getMedia('m1')
    expect(media).toMatchObject({ id: 'm1', mimeType: 'image/png', name: 'aerial.png' })
    expect(await media?.blob.text()).toBe('image-bytes')
    expect(await storage.getMedia('missing')).toBeUndefined()
  })

  it('stores preferences', async () => {
    const storage = await open()
    expect(await storage.getMeta('lastBoardId')).toBeUndefined()
    await storage.setMeta('lastBoardId', 'board-1')
    await storage.setMeta('prefs', { snap: true })
    expect(await storage.getMeta<string>('lastBoardId')).toBe('board-1')
    expect(await storage.getMeta<{ snap: boolean }>('prefs')).toEqual({ snap: true })
  })
})

describe('openSceneStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('persists across connections to the same database', async () => {
    const factory = new IDBFactory()
    const saved = board('Drill', '2026-10-25T12:00:00.000Z')
    await (await openSceneStorage(factory)).putBoard(saved)
    expect((await (await openSceneStorage(factory)).getBoard(saved.id))?.board.name).toBe('Drill')
  })

  it('uses memory storage when IndexedDB is unavailable', async () => {
    expect((await openSceneStorage(undefined)).durable).toBe(false)
  })

  it('falls back to memory storage when opening fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const throwing = { open: () => { throw new Error('denied') } } as unknown as IDBFactory
    expect((await openSceneStorage(throwing)).durable).toBe(false)
    expect(warn).toHaveBeenCalledWith('Falling back to memory storage', expect.any(Error))
  })

  it.each(['onerror', 'onblocked'] as const)('falls back to memory storage on %s', async (event) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const factory = {
      open: () => {
        const opening: Record<string, unknown> = { error: null }
        queueMicrotask(() => (opening[event] as () => void)())
        return opening
      },
    } as unknown as IDBFactory
    expect((await openSceneStorage(factory)).durable).toBe(false)
  })
})

describe('requestPersistentStorage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns false when the API is missing', async () => {
    vi.stubGlobal('navigator', {})
    expect(await requestPersistentStorage()).toBe(false)
  })

  it('returns true when already persisted', async () => {
    const persist = vi.fn(async () => false)
    vi.stubGlobal('navigator', { storage: { persisted: async () => true, persist } })
    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('asks for persistence when not yet granted', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: async () => false, persist: async () => true } })
    expect(await requestPersistentStorage()).toBe(true)
  })

  it('returns false when the browser throws', async () => {
    vi.stubGlobal('navigator', { storage: { persisted: async () => { throw new Error('nope') }, persist: async () => true } })
    expect(await requestPersistentStorage()).toBe(false)
  })
})
