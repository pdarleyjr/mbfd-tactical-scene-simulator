import { describe, expect, it } from 'vitest'
import {
  boundsOfPoints,
  closestPointOnSegment,
  closestSegment,
  distance,
  headingDegrees,
  labelAnchor,
  localToWorld,
  normalizeDegrees,
  pointAt,
  pointCount,
  polylineLength,
  reversePoints,
  rotateVector,
  simplifyPath,
  translatePoints,
} from './geometry.js'

describe('point helpers', () => {
  it('reads pairs out of flattened points', () => {
    expect(pointAt([1, 2, 3, 4], 1)).toEqual({ x: 3, y: 4 })
    expect(pointCount([1, 2, 3, 4, 5])).toBe(2)
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })
})

describe('polylineLength', () => {
  it('sums the segment lengths', () => {
    expect(polylineLength([0, 0, 3, 4, 3, 10])).toBe(11)
  })

  it('is zero for fewer than two points', () => {
    expect(polylineLength([])).toBe(0)
    expect(polylineLength([5, 5])).toBe(0)
  })
})

describe('translatePoints and reversePoints', () => {
  it('offsets x and y separately', () => {
    expect(translatePoints([0, 0, 10, 20], 5, -5)).toEqual([5, -5, 15, 15])
  })

  it('reverses the order of pairs without mutating the input', () => {
    const points = [1, 2, 3, 4, 5, 6]
    expect(reversePoints(points)).toEqual([5, 6, 3, 4, 1, 2])
    expect(points).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('rotation helpers', () => {
  it('rotates clockwise in screen coordinates', () => {
    const rotated = rotateVector({ x: 1, y: 0 }, 90)
    expect(rotated.x).toBeCloseTo(0)
    expect(rotated.y).toBeCloseTo(1)
  })

  it('places a local offset in the world', () => {
    const world = localToWorld({ x: 10, y: 10, rotation: 90 }, { x: 0, y: -5 })
    expect(world.x).toBeCloseTo(15)
    expect(world.y).toBeCloseTo(10)
  })

  it('normalizes degrees into [0, 360)', () => {
    expect(normalizeDegrees(-90)).toBe(270)
    expect(normalizeDegrees(720)).toBe(0)
    expect(normalizeDegrees(45)).toBe(45)
  })
})

describe('headingDegrees', () => {
  const origin = { x: 0, y: 0 }

  it('measures clockwise from map-up (-y)', () => {
    expect(headingDegrees(origin, { x: 0, y: -10 })).toBeCloseTo(0)
    expect(headingDegrees(origin, { x: 10, y: 0 })).toBeCloseTo(90)
    expect(headingDegrees(origin, { x: 0, y: 10 })).toBeCloseTo(180)
    expect(headingDegrees(origin, { x: -10, y: 0 })).toBeCloseTo(270)
    expect(headingDegrees(origin, { x: 10, y: -10 })).toBeCloseTo(45)
  })
})

describe('closest point queries', () => {
  it('clamps to segment ends and handles zero-length segments', () => {
    expect(closestPointOnSegment({ x: -5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({ point: { x: 0, y: 0 }, t: 0, distance: Math.hypot(5, 3) })
    expect(closestPointOnSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toMatchObject({ point: { x: 5, y: 0 }, t: 0.5, distance: 3 })
    expect(closestPointOnSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual({ point: { x: 0, y: 0 }, t: 0, distance: 5 })
  })

  it('finds the nearest segment of a polyline', () => {
    expect(closestSegment([0, 0, 10, 0, 10, 10], { x: 12, y: 5 })).toEqual({ segment: 1, point: { x: 10, y: 5 }, distance: 2 })
    expect(closestSegment([0, 0, 10, 0, 10, 10], { x: 4, y: -1 })).toEqual({ segment: 0, point: { x: 4, y: 0 }, distance: 1 })
  })

  it('returns undefined when there is no segment', () => {
    expect(closestSegment([1, 1], { x: 0, y: 0 })).toBeUndefined()
  })
})

describe('simplifyPath', () => {
  it('drops points within tolerance of the chord', () => {
    expect(simplifyPath([0, 0, 1, 0.1, 2, 0, 3, -0.1, 4, 0], 0.5)).toEqual([0, 0, 4, 0])
  })

  it('keeps significant corners', () => {
    expect(simplifyPath([0, 0, 1, 0, 2, 5, 3, 0, 4, 0], 1)).toEqual([0, 0, 2, 5, 4, 0])
    expect(simplifyPath([0, 0, 10, 0, 10, 10], 0.5)).toEqual([0, 0, 10, 0, 10, 10])
  })

  it('returns a copy of two-point paths', () => {
    const points = [0, 0, 5, 5]
    const simplified = simplifyPath(points, 1)
    expect(simplified).toEqual(points)
    expect(simplified).not.toBe(points)
  })
})

describe('labelAnchor', () => {
  it('uses the midpoint of the longest segment', () => {
    expect(labelAnchor([0, 0, 10, 0, 10, 40])).toEqual({ x: 10, y: 20, angle: 90 })
  })

  it('keeps label text upright', () => {
    expect(labelAnchor([0, 0, -10, 0])).toEqual({ x: -5, y: 0, angle: 0 })
    expect(labelAnchor([0, 0, -10, -10]).angle).toBeCloseTo(45)
    expect(labelAnchor([0, 0, -10, 10]).angle).toBeCloseTo(-45)
  })

  it('tolerates a single point', () => {
    expect(labelAnchor([3, 4])).toEqual({ x: 3, y: 4, angle: 0 })
  })
})

describe('boundsOfPoints', () => {
  it('returns the bounding box', () => {
    expect(boundsOfPoints([5, -2, -3, 8, 1, 1])).toEqual({ minX: -3, minY: -2, maxX: 5, maxY: 8 })
  })
})
