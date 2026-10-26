import { SCENE_SCHEMA_VERSION, boardSchema, convertLegacyScenario, exportFileSchema, type Board, type ExportFile, type MediaRef } from '@mbfd/domain'
import { boardFromScenario } from '../templates'
import type { MediaRecord, SceneStorage } from './storage'

export const SCENE_FILE_EXTENSION = '.mbfd-scene.json'

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read media.'))
    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl)
  return response.blob()
}

function blobRefs(board: Board): Extract<MediaRef, { kind: 'blob' }>[] {
  const refs = [board.scenario.background, board.scenario.video, board.scenario.poster]
  return refs.filter((ref): ref is Extract<MediaRef, { kind: 'blob' }> => ref?.kind === 'blob')
}

/** A portable file: the board plus any media that only exists in this browser. */
export async function buildExportFile(board: Board, storage: SceneStorage): Promise<ExportFile> {
  const media: ExportFile['media'] = []
  for (const ref of blobRefs(board)) {
    const record = await storage.getMedia(ref.blobId)
    if (record) media.push({ blobId: ref.blobId, mimeType: record.mimeType, name: record.name, dataUrl: await blobToDataUrl(record.blob) })
  }
  return { format: 'mbfd-tactical-scene', version: SCENE_SCHEMA_VERSION, exportedAt: new Date().toISOString(), board, media }
}

export function exportFileName(board: Board, now = new Date()): string {
  const slug = board.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'scene'
  return `${slug}-${now.toISOString().slice(0, 10)}${SCENE_FILE_EXTENSION}`
}

export interface ImportResult {
  boards: Board[]
  media: MediaRecord[]
  warnings: string[]
}

function freshCopy(board: Board): Board {
  return { ...board, id: crypto.randomUUID(), updatedAt: new Date().toISOString() }
}

/**
 * Accepts a V3 scene file, a single V2 scenario record, or the V2
 * `GET /api/scenarios` listing. Imported boards always receive new ids so an
 * import can never overwrite existing work.
 */
export async function parseSceneFile(text: string): Promise<ImportResult> {
  let json: unknown
  try { json = JSON.parse(text) } catch { throw new Error('That file is not valid JSON.') }
  const candidate = json && typeof json === 'object' ? json as Record<string, unknown> : null
  if (candidate && candidate.format === 'mbfd-tactical-scene') {
    const parsed = exportFileSchema.safeParse(json)
    if (!parsed.success) throw new Error(`The scene file is damaged or from a newer version (${parsed.error.issues[0]?.path.join('.') || 'unknown field'}).`)
    const idMap = new Map<string, string>()
    const media: MediaRecord[] = []
    for (const item of parsed.data.media) {
      const id = crypto.randomUUID()
      idMap.set(item.blobId, id)
      media.push({ id, blob: await dataUrlToBlob(item.dataUrl), mimeType: item.mimeType, name: item.name })
    }
    const remap = (ref: MediaRef | undefined): MediaRef | undefined => ref?.kind === 'blob' && idMap.has(ref.blobId) ? { ...ref, blobId: idMap.get(ref.blobId)! } : ref
    const board = freshCopy(parsed.data.board)
    const scenario = { ...board.scenario, background: remap(board.scenario.background)! }
    const video = remap(board.scenario.video)
    const poster = remap(board.scenario.poster)
    if (video) scenario.video = video
    if (poster) scenario.poster = poster
    const warnings = blobRefs(board).filter((ref) => !idMap.has(ref.blobId)).map(() => 'Some media was not included in the file and must be re-attached.')
    return { boards: [boardSchema.parse({ ...board, scenario })], media, warnings: [...new Set(warnings)] }
  }
  const legacyItems = Array.isArray(candidate?.items) ? candidate.items : candidate && 'worldWidth' in candidate ? [candidate] : undefined
  if (legacyItems) {
    const boards: Board[] = []
    const warnings: string[] = []
    for (const item of legacyItems) {
      const converted = convertLegacyScenario(item)
      const checked = boardSchema.safeParse(boardFromScenario(converted.scenario, converted.objects, { name: `${converted.scenario.title} (V2 import)` }))
      if (!checked.success) { warnings.push(`${converted.scenario.title}: skipped because its map size or settings are invalid.`); continue }
      boards.push(checked.data)
      warnings.push(...converted.warnings.map((warning) => `${converted.scenario.title}: ${warning}`))
    }
    return { boards, media: [], warnings }
  }
  throw new Error('This file is not an MBFD scene file.')
}

export function downloadText(fileName: string, text: string, mimeType = 'application/json') {
  downloadBlob(fileName, new Blob([text], { type: mimeType }))
}

export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
