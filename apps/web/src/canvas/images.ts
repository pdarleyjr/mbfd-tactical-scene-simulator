import { useEffect, useState } from 'react'

interface CacheEntry {
  image: HTMLImageElement
  loaded: boolean
  failed: boolean
  listeners: Set<() => void>
}

/** One decoded image per URL, shared by every vehicle that uses it. */
const cache = new Map<string, CacheEntry>()

function entryFor(url: string): CacheEntry {
  let entry = cache.get(url)
  if (entry) return entry
  const image = new Image()
  image.decoding = 'async'
  const created: CacheEntry = { image, loaded: false, failed: false, listeners: new Set() }
  image.onload = () => { created.loaded = true; created.listeners.forEach((listener) => listener()) }
  image.onerror = () => { created.failed = true; created.listeners.forEach((listener) => listener()) }
  image.src = url
  cache.set(url, created)
  entry = created
  return entry
}

export function preloadImage(url: string) {
  entryFor(url)
}

export function useHtmlImage(url: string | undefined): { image: HTMLImageElement | undefined; failed: boolean } {
  const [, force] = useState(0)
  const entry = url ? entryFor(url) : undefined
  useEffect(() => {
    if (!entry || entry.loaded || entry.failed) return
    const listener = () => force((value) => value + 1)
    entry.listeners.add(listener)
    return () => { entry.listeners.delete(listener) }
  }, [entry])
  return { image: entry?.loaded ? entry.image : undefined, failed: entry?.failed ?? false }
}
