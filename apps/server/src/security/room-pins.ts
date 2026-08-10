import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

export function hashRoomPin(pin: string): string {
  const salt = randomBytes(16)
  const digest = scryptSync(pin, salt, 32)
  return `scrypt$${salt.toString('base64url')}$${digest.toString('base64url')}`
}

export function roomPinMatches(pin: string, encoded: string): boolean {
  const [algorithm, saltValue, digestValue] = encoded.split('$')
  if (algorithm !== 'scrypt' || !saltValue || !digestValue) return false
  const expected = Buffer.from(digestValue, 'base64url')
  const actual = scryptSync(pin, Buffer.from(saltValue, 'base64url'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
