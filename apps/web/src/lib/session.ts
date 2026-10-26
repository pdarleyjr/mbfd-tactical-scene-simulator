import { useEffect, useState } from 'react'
import type { MediaRef } from '@mbfd/domain'
import { openSceneStorage, type SceneStorage } from './storage'

let storagePromise: Promise<SceneStorage> | undefined

/** The single storage connection for this tab. */
export function getStorage(): Promise<SceneStorage> {
  storagePromise ??= openSceneStorage()
  return storagePromise
}

/** Test hook: replace the storage connection. */
export function setStorageForTests(storage: SceneStorage) {
  storagePromise = Promise.resolve(storage)
}

const objectUrls = new Map<string, string>()

export async function mediaUrl(ref: MediaRef | undefined): Promise<string | undefined> {
  if (!ref) return undefined
  if (ref.kind === 'builtin') return ref.url
  const cached = objectUrls.get(ref.blobId)
  if (cached) return cached
  const record = await (await getStorage()).getMedia(ref.blobId)
  if (!record) return undefined
  const url = URL.createObjectURL(record.blob)
  objectUrls.set(ref.blobId, url)
  return url
}

export function useMediaUrl(ref: MediaRef | undefined): string | undefined {
  const key = ref ? (ref.kind === 'builtin' ? ref.url : ref.blobId) : ''
  const [state, setState] = useState<{ key: string; url: string | undefined }>(() => ({ key, url: ref?.kind === 'builtin' ? ref.url : undefined }))
  useEffect(() => {
    let cancelled = false
    void mediaUrl(ref).then((url) => { if (!cancelled) setState({ key, url }) })
    return () => { cancelled = true }
    // `key` captures every field of the reference that matters.
  }, [key]) // oxlint-disable-line react-hooks/exhaustive-deps
  if (ref?.kind === 'builtin') return ref.url
  return state.key === key ? state.url : undefined
}
