/** Scenes this browser has visited, newest first, so a separate scene's link is never lost. */

export interface RecentScene {
  id: string
  name: string
  visitedAt: number
}

const KEY = 'mbfd-recent-scenes'
const LIMIT = 12

export function recentScenes(): RecentScene[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is RecentScene => Boolean(item) && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.visitedAt === 'number')
  } catch {
    return []
  }
}

export function rememberScene(id: string, name: string, now = Date.now()) {
  try {
    const next = [{ id, name, visitedAt: now }, ...recentScenes().filter((item) => item.id !== id)].slice(0, LIMIT)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* storage unavailable: the list is a convenience only */ }
}
