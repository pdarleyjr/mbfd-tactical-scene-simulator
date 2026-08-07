import { create } from 'zustand'
import type { Mode300, ParticipantRole, Permission, TokenClaims } from '@mbfd/domain'

const clientIdKey = 'mbfd-firesim-client-id'
const participantKey = 'mbfd-firesim-participant'
const instructorTokenKey = 'mbfd-firesim-instructor-token'

function getOrCreateClientId(): string {
  const existing = localStorage.getItem(clientIdKey)
  if (existing) return existing
  const id = crypto.randomUUID()
  localStorage.setItem(clientIdKey, id)
  return id
}

function readParticipant(): Partial<AuthState> {
  try {
    return JSON.parse(sessionStorage.getItem(participantKey) ?? '{}') as Partial<AuthState>
  } catch {
    return {}
  }
}

interface AuthState {
  clientId: string
  token: string | undefined
  sessionId: string | undefined
  name: string | undefined
  unit: string | undefined
  role: ParticipantRole | undefined
  mode300: Mode300 | undefined
  permissions: Permission[] | undefined
  instructorToken: string | undefined
  setParticipant: (input: { token: string; claims: TokenClaims }) => void
  setInstructorToken: (token: string) => void
  clearParticipant: () => void
}

const cached = typeof window === 'undefined' ? {} : readParticipant()

export const useAuthStore = create<AuthState>((set) => ({
  clientId: typeof window === 'undefined' ? 'server-render' : getOrCreateClientId(),
  token: cached.token,
  sessionId: cached.sessionId,
  name: cached.name,
  unit: cached.unit,
  role: cached.role,
  mode300: cached.mode300,
  permissions: cached.permissions,
  instructorToken: typeof window === 'undefined' ? undefined : sessionStorage.getItem(instructorTokenKey) ?? undefined,
  setParticipant: ({ token, claims }) => {
    const next = { token, sessionId: claims.sessionId, name: claims.name, unit: claims.unit, role: claims.role, mode300: claims.mode300, permissions: claims.permissions }
    sessionStorage.setItem(participantKey, JSON.stringify(next))
    set(next)
  },
  setInstructorToken: (token) => {
    sessionStorage.setItem(instructorTokenKey, token)
    set({ instructorToken: token })
  },
  clearParticipant: () => {
    sessionStorage.removeItem(participantKey)
    set({ token: undefined, sessionId: undefined, name: undefined, unit: undefined, role: undefined, mode300: undefined, permissions: undefined })
  },
}))

export function decodeClaims(token: string): TokenClaims {
  const payload = token.split('.')[1]
  if (!payload) throw new Error('Invalid session token')
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return JSON.parse(atob(padded)) as TokenClaims
}
