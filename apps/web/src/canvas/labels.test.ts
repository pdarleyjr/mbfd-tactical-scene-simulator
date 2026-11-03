import { describe, expect, it } from 'vitest'
import { defaultHoseLoads } from '@mbfd/domain'
import { readHose } from '@mbfd/fire-model'
import { hoseLabelText, hoseRole, labelMetrics, layoutLineLabels, lengthLabelFontPx, measureLabelText, rectsOverlap, segmentHitsRect, LABEL_FONT_LIMITS, type LabelRequest } from './labels'

const measure = (text: string, fontPx: number) => text.length * fontPx * 0.56
const calibration = { feetPerWorldUnit: 1, a: { x: 0, y: 0 }, b: { x: 1, y: 0 }, distanceFt: 1, reference: '', calibratedAt: '2026-11-03T00:00:00.000Z' }

describe('lengthLabelFontPx', () => {
  it('is readable on a laptop and larger on a 4K classroom panel', () => {
    expect(lengthLabelFontPx(1366)).toBeGreaterThanOrEqual(15)
    expect(lengthLabelFontPx(1440)).toBe(16)
    expect(lengthLabelFontPx(3840)).toBeGreaterThanOrEqual(24)
    expect(lengthLabelFontPx(390)).toBeGreaterThanOrEqual(LABEL_FONT_LIMITS.min)
  })

  it('grows while presenting and stays within its limits', () => {
    expect(lengthLabelFontPx(1440, true)).toBeGreaterThan(lengthLabelFontPx(1440))
    expect(lengthLabelFontPx(3840, true)).toBeLessThanOrEqual(LABEL_FONT_LIMITS.max)
  })

  it('gives the pill padding and a thicker outline on large text', () => {
    expect(labelMetrics(16)).toMatchObject({ strokePx: 2 })
    expect(labelMetrics(26).strokePx).toBe(3)
    expect(labelMetrics(16).height).toBeGreaterThan(16)
  })
})

describe('hoseLabelText', () => {
  it('names the line by size and role, with feet and sections', () => {
    const supply = { hoseType: 'supply5' as const, purpose: 'supply' as const, points: [0, 0, 412, 0], loadFt: 800 }
    expect(hoseLabelText(supply, readHose(supply, defaultHoseLoads, calibration))).toBe('5″ supply · 412 ft · 5 × 100′')
    const attack = { hoseType: 'attack175' as const, purpose: 'attack' as const, points: [0, 0, 230, 0], loadFt: 200 }
    expect(hoseLabelText(attack, readHose(attack, defaultHoseLoads, calibration))).toBe('1¾″ attack · 230 ft · 3 × 100′ · 30 ft over')
    expect(hoseLabelText(attack, readHose(attack, defaultHoseLoads))).toBe('1¾″ attack · 230 u')
  })

  it('calls a 3″ line a feeder unless it is used for attack', () => {
    expect(hoseRole({ hoseType: 'hose3', purpose: 'feeder' })).toBe('feeder')
    expect(hoseRole({ hoseType: 'hose3', purpose: 'attack' })).toBe('attack')
  })
})

describe('geometry helpers', () => {
  it('detects overlapping rectangles, with an optional gap', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 4, height: 4 })).toBe(true)
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 12, y: 0, width: 4, height: 4 })).toBe(false)
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 12, y: 0, width: 4, height: 4 }, 3)).toBe(true)
  })

  it('detects segments that cross a rectangle', () => {
    const rect = { x: 10, y: 10, width: 10, height: 10 }
    expect(segmentHitsRect(0, 15, 30, 15, rect)).toBe(true)
    expect(segmentHitsRect(0, 0, 5, 30, rect)).toBe(false)
    expect(segmentHitsRect(12, 12, 13, 13, rect)).toBe(true)
    expect(segmentHitsRect(0, 25, 30, 25, rect)).toBe(false)
    expect(segmentHitsRect(15, 0, 15, 5, rect)).toBe(false)
  })

  it('estimates text width without a canvas', () => {
    expect(measureLabelText('412 ft', 16)).toBeGreaterThan(20)
  })
})

describe('layoutLineLabels', () => {
  const line = (id: string, points: number[]): LabelRequest => ({ id, points, text: '5″ supply · 412 ft · 5 × 100′', lineWidthPx: 8 })

  it('puts the pill beside its line, never on it', () => {
    const [label] = layoutLineLabels([line('a', [0, 0, 400, 0])], 1, 16, [], measure)
    const rect = { x: label!.x - label!.width / 2, y: label!.y - label!.height / 2, width: label!.width, height: label!.height }
    expect(segmentHitsRect(0, 0, 400, 0, rect)).toBe(false)
    expect(label!.y).toBeLessThan(0)
    expect(label!.crowded).toBe(false)
  })

  it('keeps labels of side-by-side lines apart', () => {
    const labels = layoutLineLabels([line('a', [0, 0, 500, 0]), line('b', [0, 30, 500, 30]), line('c', [0, 60, 500, 60])], 1, 16, [], measure)
    const rects = labels.map((label) => ({ x: label.x - label.width / 2, y: label.y - label.height / 2, width: label.width, height: label.height }))
    for (let i = 0; i < rects.length; i += 1) for (let j = i + 1; j < rects.length; j += 1) expect(rectsOverlap(rects[i]!, rects[j]!)).toBe(false)
  })

  it('works in screen pixels at any zoom and steps around obstacles', () => {
    const free = layoutLineLabels([line('a', [0, 0, 200, 0])], 2, 16, [], measure)[0]!
    const blocked = { x: free.x * 2 - free.width / 2 - 2, y: free.y * 2 - free.height / 2 - 2, width: free.width + 4, height: free.height + 4 }
    const moved = layoutLineLabels([line('a', [0, 0, 200, 0])], 2, 16, [blocked], measure)[0]!
    expect(Math.hypot(moved.x - free.x, moved.y - free.y)).toBeGreaterThan(5)
    const rect = { x: moved.x * 2 - moved.width / 2, y: moved.y * 2 - moved.height / 2, width: moved.width, height: moved.height }
    expect(rectsOverlap(rect, blocked)).toBe(false)
  })

  it('handles a line with no length', () => {
    const [label] = layoutLineLabels([line('a', [5, 5, 5, 5])], 1, 16, [], measure)
    expect(label).toMatchObject({ x: 5, y: 5, crowded: true })
  })
})
