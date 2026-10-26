export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export function formatRelative(timestamp: number | string, now = Date.now()): string {
  const time = typeof timestamp === 'string' ? Date.parse(timestamp) : timestamp
  const seconds = Math.round((now - time) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
}

const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

export function compassPoint(degrees: number): string {
  return compass[Math.round((((degrees % 360) + 360) % 360) / 45) % 8]!
}
