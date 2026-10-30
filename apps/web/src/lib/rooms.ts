import { hostKeySchema, sceneIdSchema } from '@mbfd/domain'

/**
 * Simulations this browser started. The host key is the proof of ownership the
 * server asks for; it is kept in this browser only, so clearing site data
 * gives up host rights (the owner link restores them on another device).
 * Guests keep nothing here: the invite link is their access.
 */

export type HostedKind = 'solo' | 'shared'

export interface HostedRoom {
  id: string
  kind: HostedKind
  hostKey: string
  createdAt: number
}

const KEY = 'mbfd-hosted-rooms'
const LIMIT = 30

export function parseHostedRooms(text: string | null): HostedRoom[] {
  if (!text) return []
  try {
    const parsed: unknown = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is HostedRoom => Boolean(item) && typeof item === 'object'
      && sceneIdSchema.safeParse((item as HostedRoom).id).success
      && ((item as HostedRoom).kind === 'solo' || (item as HostedRoom).kind === 'shared')
      && hostKeySchema.safeParse((item as HostedRoom).hostKey).success
      && typeof (item as HostedRoom).createdAt === 'number')
  } catch {
    return []
  }
}

export function hostedRooms(): HostedRoom[] {
  try { return parseHostedRooms(localStorage.getItem(KEY)) } catch { return [] }
}

export function hostKeyFor(id: string): string | undefined {
  return hostedRooms().find((room) => room.id === id)?.hostKey
}

export function rememberHostedRoom(room: HostedRoom) {
  try {
    const next = [room, ...hostedRooms().filter((item) => item.id !== room.id)].slice(0, LIMIT)
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch { /* storage unavailable: the simulation still works until this tab closes */ }
}

export function forgetHostedRoom(id: string) {
  try { localStorage.setItem(KEY, JSON.stringify(hostedRooms().filter((room) => room.id !== id))) } catch { /* nothing stored to forget */ }
}

/** The link that gives full control on another device. The key sits after the #, so it is never sent to the server in the address. */
export function ownerLink(room: Pick<HostedRoom, 'id' | 'kind' | 'hostKey'>, origin = location.origin): string {
  return `${origin}/s/${room.id}#host=${room.hostKey}&kind=${room.kind}`
}

/** Reads an owner link's fragment. */
export function hostFromHash(hash: string): { hostKey: string; kind: HostedKind } | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const hostKey = params.get('host')
  if (!hostKey || !hostKeySchema.safeParse(hostKey).success) return undefined
  return { hostKey, kind: params.get('kind') === 'solo' ? 'solo' : 'shared' }
}

/** If the address carries an owner link, keeps the key on this device and removes it from the address bar. */
export function adoptOwnerLink(id: string) {
  const found = hostFromHash(location.hash)
  if (!found) return
  rememberHostedRoom({ id, kind: found.kind, hostKey: found.hostKey, createdAt: Date.now() })
  history.replaceState(null, '', `${location.pathname}${location.search}`)
}

/** Fixes the stored kind once the server confirms it (a private simulation later shared). */
export function updateHostedKind(id: string, kind: HostedKind) {
  const room = hostedRooms().find((item) => item.id === id)
  if (room && room.kind !== kind) rememberHostedRoom({ ...room, kind })
}

async function errorText(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown }
    if (typeof body.error === 'string') return body.error
  } catch { /* not JSON */ }
  return fallback
}

/** Starts a new room on the server and remembers its host key. The server picks the id. */
export async function createRoom(kind: HostedKind): Promise<HostedRoom> {
  let response: Response
  try {
    response = await fetch('/sync-api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) })
  } catch {
    throw new Error('Could not reach the simulation server. Check the connection and try again.')
  }
  if (!response.ok) throw new Error(await errorText(response, 'The simulation could not be started. Try again.'))
  const body = await response.json() as { id?: unknown; hostKey?: unknown }
  if (typeof body.id !== 'string' || !sceneIdSchema.safeParse(body.id).success || typeof body.hostKey !== 'string' || !hostKeySchema.safeParse(body.hostKey).success) {
    throw new Error('The server answered with something unexpected. Try again.')
  }
  const room: HostedRoom = { id: body.id, kind, hostKey: body.hostKey, createdAt: Date.now() }
  rememberHostedRoom(room)
  return room
}

export type HostAction = 'lock' | 'unlock' | 'end' | 'reopen' | 'share'

/** A host-only change to a room (lock, end, reopen, share). Throws with the server's reason on refusal. */
export async function hostAction(id: string, action: HostAction): Promise<void> {
  const hostKey = hostKeyFor(id)
  if (!hostKey) throw new Error('Only the host of this simulation can do that, and this device is not the host.')
  let response: Response
  try {
    response = await fetch(`/sync-api/rooms/${id}/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hostKey }) })
  } catch {
    throw new Error('Could not reach the simulation server. Check the connection and try again.')
  }
  if (!response.ok) throw new Error(await errorText(response, 'That did not work. Try again.'))
}

/** Headers that prove host rights on the server's saved-version routes. */
export function hostHeaders(id: string): Record<string, string> {
  const hostKey = hostKeyFor(id)
  return hostKey ? { 'X-Host-Key': hostKey } : {}
}
