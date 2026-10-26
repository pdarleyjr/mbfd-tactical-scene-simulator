import type { Board, MediaRef } from '@mbfd/domain'
import { blobRefs } from './scene-files'
import type { SceneStorage } from './storage'

/** Uploads a map image or video so everyone in a shared scene can load it. */
export async function uploadMedia(blob: Blob, name: string): Promise<Extract<MediaRef, { kind: 'builtin' }>> {
  let response: Response
  try {
    response = await fetch('/sync-api/media', { method: 'POST', headers: { 'Content-Type': blob.type }, body: blob })
  } catch {
    throw new Error(`“${name}” could not be uploaded. Check the connection and try again.`)
  }
  const body = await response.json().catch(() => ({})) as { url?: string; error?: string }
  if (!response.ok || !body.url) throw new Error(body.error ?? `“${name}” could not be uploaded.`)
  return { kind: 'builtin', url: body.url }
}

/**
 * A board whose media lives only in this browser cannot be seen by anyone
 * else, so its images and video are uploaded and referenced by URL instead.
 */
export async function shareBoardMedia(board: Board, storage: SceneStorage): Promise<{ board: Board; missing: number }> {
  const uploaded = new Map<string, MediaRef>()
  let missing = 0
  for (const ref of blobRefs(board)) {
    if (uploaded.has(ref.blobId)) continue
    const record = await storage.getMedia(ref.blobId)
    if (!record) { missing += 1; continue }
    uploaded.set(ref.blobId, await uploadMedia(record.blob, record.name || ref.name))
  }
  const swap = (ref: MediaRef | undefined) => ref?.kind === 'blob' ? uploaded.get(ref.blobId) ?? ref : ref
  const scenario = { ...board.scenario, background: swap(board.scenario.background)! }
  const video = swap(board.scenario.video)
  const poster = swap(board.scenario.poster)
  if (video) scenario.video = video
  if (poster) scenario.poster = poster
  return { board: { ...board, scenario }, missing }
}
