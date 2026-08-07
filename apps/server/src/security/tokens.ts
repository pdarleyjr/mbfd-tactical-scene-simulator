import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { tokenClaimsSchema, type Mode300, type ParticipantRole, type Permission, type TokenClaims } from '@mbfd/domain'

interface ControllerClaims {
  kind: 'instructor'
  clientId: string
  iat: number
  exp: number
  jti: string
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signature(value: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(value).digest()
}

function sign(payload: object, secret: string): string {
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`
  return `${body}.${signature(body, secret).toString('base64url')}`
}

function verify(token: string, secret: string): unknown {
  const parts = token.split('.')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error('Invalid token')
  const body = `${parts[0]}.${parts[1]}`
  const actual = Buffer.from(parts[2], 'base64url')
  const expected = signature(body, secret)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid token signature')
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { exp?: number }
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('Token expired')
  return payload
}

export function constantTimePinMatches(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export function signControllerToken(secret: string, ttlSeconds = 8 * 60 * 60): string {
  const now = Math.floor(Date.now() / 1000)
  return sign({ kind: 'instructor', clientId: randomUUID(), iat: now, exp: now + ttlSeconds, jti: randomUUID() } satisfies ControllerClaims, secret)
}

export function verifyControllerToken(token: string, secret: string): ControllerClaims {
  const payload = verify(token, secret) as Partial<ControllerClaims>
  if (payload.kind !== 'instructor' || !payload.clientId || !payload.iat || !payload.exp || !payload.jti) throw new Error('Invalid controller token')
  return payload as ControllerClaims
}

export function signSessionToken(input: {
  sessionId: string
  clientId: string
  name: string
  unit: string
  role: ParticipantRole
  mode300: Mode300
  permissions: Permission[]
}, secret: string, ttlSeconds = 12 * 60 * 60): string {
  const now = Math.floor(Date.now() / 1000)
  return sign({ ...input, iat: now, exp: now + ttlSeconds, jti: randomUUID() }, secret)
}

export function verifySessionToken(token: string, secret: string): TokenClaims {
  return tokenClaimsSchema.parse(verify(token, secret))
}
