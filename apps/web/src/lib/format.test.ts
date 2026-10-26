import { describe, expect, it } from 'vitest'
import { compassPoint, formatElapsed, formatRelative } from './format'

describe('formatElapsed', () => {
  it('formats minutes and seconds under an hour', () => {
    expect(formatElapsed(0)).toBe('00:00')
    expect(formatElapsed(59_999)).toBe('00:59')
    expect(formatElapsed(65_000)).toBe('01:05')
    expect(formatElapsed(3_599_000)).toBe('59:59')
  })

  it('adds hours from one hour on', () => {
    expect(formatElapsed(3_600_000)).toBe('1:00:00')
    expect(formatElapsed(3_661_000)).toBe('1:01:01')
    expect(formatElapsed(36_000_000)).toBe('10:00:00')
  })

  it('clamps negative values to zero', () => {
    expect(formatElapsed(-5000)).toBe('00:00')
  })
})

describe('formatRelative', () => {
  const now = Date.parse('2026-10-25T12:00:00.000Z')

  it('describes recent times', () => {
    expect(formatRelative(now - 2000, now)).toBe('just now')
    expect(formatRelative(now - 30_000, now)).toBe('30s ago')
    expect(formatRelative(now - 5 * 60_000, now)).toBe('5 min ago')
    expect(formatRelative(now - 3 * 3_600_000, now)).toBe('3 h ago')
  })

  it('accepts ISO strings', () => {
    expect(formatRelative('2026-10-25T11:59:01.000Z', now)).toBe('59s ago')
    expect(formatRelative('2026-10-25T11:59:00.000Z', now)).toBe('1 min ago')
    expect(formatRelative('2026-10-25T11:58:00.000Z', now)).toBe('2 min ago')
  })

  it('falls back to a calendar date after a day', () => {
    const time = now - 3 * 86_400_000
    expect(formatRelative(time, now)).toBe(new Date(time).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }))
  })
})

describe('compassPoint', () => {
  it('rounds degrees to the nearest of eight points', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(22)).toBe('N')
    expect(compassPoint(23)).toBe('NE')
    expect(compassPoint(90)).toBe('E')
    expect(compassPoint(180)).toBe('S')
    expect(compassPoint(225)).toBe('SW')
    expect(compassPoint(350)).toBe('N')
  })

  it('normalizes negative and large angles', () => {
    expect(compassPoint(-90)).toBe('W')
    expect(compassPoint(405)).toBe('NE')
  })
})
