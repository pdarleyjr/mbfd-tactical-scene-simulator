import { describe, expect, it } from 'vitest'
import { fitWorldToViewport, pinchViewport, preserveCenterOnResize, screenToWorld, worldToScreen, zoomAroundPoint, ZOOM_LIMITS, type ViewportTransform } from './viewport'

describe('fitWorldToViewport', () => {
  it('fits and centers the world without padding', () => {
    expect(fitWorldToViewport({ width: 1000, height: 500 }, { width: 800, height: 800 })).toEqual({ scale: 0.8, x: 0, y: 200 })
  })

  it('honors uniform padding', () => {
    expect(fitWorldToViewport({ width: 1000, height: 500 }, { width: 800, height: 800 }, 50)).toEqual({ scale: 0.7, x: 50, y: 225 })
  })

  it('honors per-side padding', () => {
    const fit = fitWorldToViewport({ width: 100, height: 100 }, { width: 400, height: 300 }, { top: 100, right: 0, bottom: 0, left: 200 })
    expect(fit).toEqual({ scale: 2, x: 200, y: 100 })
  })

  it('never divides by a non-positive usable area', () => {
    const fit = fitWorldToViewport({ width: 100, height: 100 }, { width: 20, height: 20 }, 50)
    expect(fit.scale).toBe(0.01)
    expect(Number.isFinite(fit.x)).toBe(true)
  })
})

describe('screen and world conversion', () => {
  const viewport: ViewportTransform = { scale: 2, x: 30, y: -10 }

  it('converts in both directions', () => {
    expect(worldToScreen({ x: 10, y: 20 }, viewport)).toEqual({ x: 50, y: 30 })
    expect(screenToWorld({ x: 50, y: 30 }, viewport)).toEqual({ x: 10, y: 20 })
  })
})

describe('zoomAroundPoint', () => {
  const viewport: ViewportTransform = { scale: 1, x: 0, y: 0 }

  it('keeps the world point under the anchor fixed', () => {
    const anchor = { x: 200, y: 100 }
    const before = screenToWorld(anchor, viewport)
    const zoomed = zoomAroundPoint(viewport, anchor, 2)
    expect(zoomed.scale).toBe(2)
    expect(screenToWorld(anchor, zoomed)).toEqual(before)
  })

  it('clamps to the zoom limits', () => {
    expect(zoomAroundPoint(viewport, { x: 0, y: 0 }, 100).scale).toBe(ZOOM_LIMITS.max)
    expect(zoomAroundPoint(viewport, { x: 0, y: 0 }, 0.001).scale).toBe(ZOOM_LIMITS.min)
    expect(zoomAroundPoint(viewport, { x: 0, y: 0 }, 5, { min: 1, max: 3 }).scale).toBe(3)
  })
})

describe('pinchViewport', () => {
  const viewport: ViewportTransform = { scale: 1, x: 10, y: 10 }

  it('ignores degenerate touch distances', () => {
    expect(pinchViewport(viewport, { distance: 0, center: { x: 0, y: 0 } }, { distance: 50, center: { x: 0, y: 0 } })).toBe(viewport)
    expect(pinchViewport(viewport, { distance: 50, center: { x: 0, y: 0 } }, { distance: 0, center: { x: 0, y: 0 } })).toBe(viewport)
  })

  it('scales by the distance ratio and follows the moving center', () => {
    const previous = { distance: 100, center: { x: 110, y: 60 } }
    const next = { distance: 200, center: { x: 150, y: 80 } }
    const pinched = pinchViewport(viewport, previous, next)
    expect(pinched.scale).toBe(2)
    expect(screenToWorld(next.center, pinched)).toEqual(screenToWorld(previous.center, viewport))
  })

  it('clamps the pinch scale', () => {
    expect(pinchViewport(viewport, { distance: 1, center: { x: 0, y: 0 } }, { distance: 1000, center: { x: 0, y: 0 } }).scale).toBe(ZOOM_LIMITS.max)
  })
})

describe('preserveCenterOnResize', () => {
  it('shifts by half the size change', () => {
    expect(preserveCenterOnResize({ scale: 1.5, x: 10, y: 20 }, { width: 800, height: 600 }, { width: 1000, height: 500 })).toEqual({ scale: 1.5, x: 110, y: -30 })
  })
})
