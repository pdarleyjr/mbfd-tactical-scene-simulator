// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boardSchema, type Board } from '@mbfd/domain'
import { boardFromTemplate } from '../templates'
import { blobToDataUrl, buildExportFile, dataUrlToBlob, downloadText, exportFileName, parseSceneFile, SCENE_FILE_EXTENSION } from './scene-files'
import { createMemoryStorage } from './storage'

function withBlobMedia(board: Board, background: string, poster?: string): Board {
  return {
    ...board,
    scenario: {
      ...board.scenario,
      background: { kind: 'blob', blobId: background, mimeType: 'image/png', name: 'aerial.png' },
      ...(poster ? { poster: { kind: 'blob' as const, blobId: poster, mimeType: 'image/webp', name: 'poster.webp' } } : {}),
    },
  }
}

function legacyScenario(title: string, extra: Record<string, unknown> = {}) {
  return {
    title,
    description: 'Imported from V2',
    dispatchInformation: 'Smoke showing',
    worldWidth: 1200,
    worldHeight: 800,
    staticObjects: [{ id: `${title}-hydrant`, type: 'hydrant', label: 'H1', x: 10, y: 20 }],
    assets: [],
    ...extra,
  }
}

describe('exportFileName', () => {
  it('slugs the board name and appends the date and extension', () => {
    const board = { ...boardFromTemplate(), name: 'Residential Structure Fire — Waterfront Estate' }
    expect(exportFileName(board, new Date('2026-10-25T12:00:00.000Z'))).toBe(`residential-structure-fire-waterfront-estate-2026-10-25${SCENE_FILE_EXTENSION}`)
  })

  it('falls back to "scene" for names with no usable characters', () => {
    expect(exportFileName({ ...boardFromTemplate(), name: '!!!' }, new Date('2026-01-02T00:00:00.000Z'))).toBe('scene-2026-01-02.mbfd-scene.json')
  })
})

describe('media data URLs', () => {
  it('converts blobs to data URLs and back', async () => {
    const dataUrl = await blobToDataUrl(new Blob(['hello'], { type: 'text/plain' }))
    expect(dataUrl).toMatch(/^data:text\/plain;base64,/)
    expect(await (await dataUrlToBlob(dataUrl)).text()).toBe('hello')
  })
})

describe('buildExportFile', () => {
  it('exports a board with built-in media and no embedded files', async () => {
    const board = boardFromTemplate()
    const file = await buildExportFile(board, createMemoryStorage())
    expect(file).toMatchObject({ format: 'mbfd-tactical-scene', version: 3, board, media: [] })
    expect(Date.parse(file.exportedAt)).not.toBeNaN()
  })

  it('embeds browser-only media and skips missing records', async () => {
    const storage = createMemoryStorage()
    await storage.putMedia({ id: 'bg', blob: new Blob(['png-bytes'], { type: 'image/png' }), mimeType: 'image/png', name: 'aerial.png' })
    const file = await buildExportFile(withBlobMedia(boardFromTemplate(), 'bg', 'missing-poster'), storage)
    expect(file.media).toHaveLength(1)
    expect(file.media[0]).toMatchObject({ blobId: 'bg', mimeType: 'image/png', name: 'aerial.png' })
    expect(file.media[0]?.dataUrl).toMatch(/^data:image\/png;base64,/)
  })
})

describe('parseSceneFile with V3 files', () => {
  it('round-trips an export into a new board id', async () => {
    const original = boardFromTemplate()
    const text = JSON.stringify(await buildExportFile(original, createMemoryStorage()))
    const result = await parseSceneFile(text)
    expect(result.boards).toHaveLength(1)
    const imported = result.boards[0]!
    expect(imported.id).not.toBe(original.id)
    expect(imported.name).toBe(original.name)
    expect(imported.objects).toEqual(original.objects)
    expect(imported.scenario).toEqual(original.scenario)
    expect(result.media).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('gives embedded media new ids and points the scenario at them', async () => {
    const storage = createMemoryStorage()
    await storage.putMedia({ id: 'bg', blob: new Blob(['png-bytes'], { type: 'image/png' }), mimeType: 'image/png', name: 'aerial.png' })
    await storage.putMedia({ id: 'poster', blob: new Blob(['webp-bytes'], { type: 'image/webp' }), mimeType: 'image/webp', name: 'poster.webp' })
    const text = JSON.stringify(await buildExportFile(withBlobMedia(boardFromTemplate(), 'bg', 'poster'), storage))
    const result = await parseSceneFile(text)
    expect(result.media).toHaveLength(2)
    const [background, poster] = result.media
    expect(background?.id).not.toBe('bg')
    expect(background).toMatchObject({ mimeType: 'image/png', name: 'aerial.png' })
    expect(await background?.blob.text()).toBe('png-bytes')
    const scenario = result.boards[0]!.scenario
    expect(scenario.background).toEqual({ kind: 'blob', blobId: background!.id, mimeType: 'image/png', name: 'aerial.png' })
    expect(scenario.poster).toMatchObject({ kind: 'blob', blobId: poster!.id })
    expect(scenario.video).toEqual({ kind: 'builtin', url: '/scenario-assets/seed/initial-conditions.mp4' })
    expect(result.warnings).toEqual([])
  })

  it('warns once when referenced media is missing from the file', async () => {
    const text = JSON.stringify(await buildExportFile(withBlobMedia(boardFromTemplate(), 'gone-bg', 'gone-poster'), createMemoryStorage()))
    const result = await parseSceneFile(text)
    expect(result.warnings).toEqual(['Some media was not included in the file and must be re-attached.'])
    expect(result.boards[0]!.scenario.background).toMatchObject({ kind: 'blob', blobId: 'gone-bg' })
  })

  it('rejects damaged scene files with the failing field', async () => {
    const file = await buildExportFile(boardFromTemplate(), createMemoryStorage())
    const damaged = JSON.stringify({ ...file, board: { ...file.board, name: '' } })
    await expect(parseSceneFile(damaged)).rejects.toThrow('The scene file is damaged or from a newer version (board.name).')
  })
})

describe('parseSceneFile with V2 data', () => {
  it('imports one board per item of a V2 listing', async () => {
    const result = await parseSceneFile(JSON.stringify({ items: [legacyScenario('Alpha'), legacyScenario('Bravo')] }))
    expect(result.boards.map((board) => board.name)).toEqual(['Alpha (V2 import)', 'Bravo (V2 import)'])
    expect(new Set(result.boards.map((board) => board.id)).size).toBe(2)
    expect(result.boards[0]!.objects).toEqual([expect.objectContaining({ id: 'Alpha-hydrant', type: 'hydrant', label: 'H1' })])
    expect(result.boards[0]!.scenario.world).toEqual({ width: 1200, height: 800 })
    for (const board of result.boards) expect(boardSchema.safeParse(board).success).toBe(true)
    expect(result.media).toEqual([])
    expect(result.warnings).toEqual([
      'Alpha: The scenario has no background image; attach one in Scenario settings.',
      'Bravo: The scenario has no background image; attach one in Scenario settings.',
    ])
  })

  it('imports a single V2 scenario record', async () => {
    const result = await parseSceneFile(JSON.stringify(legacyScenario('Solo', { assets: [{ kind: 'background', runtimeUrl: '/scenario-assets/seed/background.webp' }] })))
    expect(result.boards).toHaveLength(1)
    expect(result.boards[0]!.scenario.dispatch).toBe('Smoke showing')
    expect(result.warnings).toEqual([])
  })

  it('imports an empty V2 listing as no boards', async () => {
    expect(await parseSceneFile('{"items":[]}')).toEqual({ boards: [], media: [], warnings: [] })
  })
})

describe('parseSceneFile errors', () => {
  it('rejects invalid JSON', async () => {
    await expect(parseSceneFile('{not json')).rejects.toThrow('That file is not valid JSON.')
  })

  it.each(['{"hello":"world"}', 'null', '[]', '{"items":"nope"}'])('rejects unknown content %s', async (text) => {
    await expect(parseSceneFile(text)).rejects.toThrow('This file is not an MBFD scene file.')
  })

  // Known source bug (scene-files.ts, legacy detection): `'worldWidth' in candidate`
  // throws a raw TypeError for JSON primitives instead of the friendly message.
  it.each(['42', '"just text"', 'true'])('rejects primitive JSON %s with the friendly message', async (text) => {
    await expect(parseSceneFile(text)).rejects.toThrow('This file is not an MBFD scene file.')
  })
})

describe('downloadText', () => {
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('clicks a temporary download link and revokes the URL later', async () => {
    const created: Blob[] = []
    URL.createObjectURL = vi.fn((blob: Blob) => { created.push(blob); return 'blob:scene' })
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    downloadText('scene.json', '{"a":1}')

    expect(click).toHaveBeenCalledTimes(1)
    const clicked = click.mock.contexts[0] as HTMLAnchorElement | undefined
    expect(clicked?.download).toBe('scene.json')
    expect(clicked?.href).toBe('blob:scene')
    expect(document.querySelector('a')).toBeNull()
    expect(created[0]?.type).toBe('application/json')
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:scene')
  })
})
