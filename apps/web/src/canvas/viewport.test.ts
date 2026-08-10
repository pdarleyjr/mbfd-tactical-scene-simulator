import { describe, expect, it } from 'vitest'
import { fitWorldToViewport, pinchViewport, screenToWorld, zoomAroundPoint } from './viewport.js'

describe('canvas viewport transforms', () => {
  it('fits the supplied 1586×992 world without distorting its aspect ratio', () => {
    const viewport = fitWorldToViewport({ width: 1586, height: 992 }, { width: 1024, height: 700 }, 24)
    expect(viewport.scale).toBeCloseTo(Math.min((1024 - 48) / 1586, (700 - 48) / 992))
    expect(viewport.x).toBeGreaterThanOrEqual(24)
    expect(viewport.y).toBeGreaterThanOrEqual(24)
  })

  it('converts pointer coordinates into stable logical world coordinates', () => {
    expect(screenToWorld({ x: 500, y: 300 }, { x: 100, y: 50, scale: 2 })).toEqual({ x: 200, y: 125 })
  })

  it('keeps the world point under a pinch/wheel anchor from jumping while zooming', () => {
    const initial = { x: 40, y: 25, scale: 1.2 }
    const anchor = { x: 420, y: 260 }
    const before = screenToWorld(anchor, initial)
    const zoomed = zoomAroundPoint(initial, anchor, 2.1)
    const after = screenToWorld(anchor, zoomed)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })

  it('combines two-finger pinch zoom and pan without moving the anchored world point', () => {
    const initial = { x: 20, y: 30, scale: 1 }
    const previous = { distance: 100, center: { x: 200, y: 160 } }
    const next = { distance: 180, center: { x: 240, y: 190 } }
    const anchoredWorldPoint = screenToWorld(previous.center, initial)
    const pinched = pinchViewport(initial, previous, next)

    expect(pinched.scale).toBeCloseTo(1.8)
    expect(screenToWorld(next.center, pinched).x).toBeCloseTo(anchoredWorldPoint.x)
    expect(screenToWorld(next.center, pinched).y).toBeCloseTo(anchoredWorldPoint.y)
  })
})
