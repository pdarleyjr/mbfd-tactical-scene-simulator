export interface Vec { x: number; y: number }

export function distance(a: Vec, b: Vec): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function pointAt(points: readonly number[], index: number): Vec {
  return { x: points[index * 2]!, y: points[index * 2 + 1]! }
}

export function pointCount(points: readonly number[]): number {
  return Math.floor(points.length / 2)
}

export function polylineLength(points: readonly number[]): number {
  let total = 0
  for (let index = 2; index + 1 < points.length; index += 2) {
    total += Math.hypot(points[index]! - points[index - 2]!, points[index + 1]! - points[index - 1]!)
  }
  return total
}

export function translatePoints(points: readonly number[], dx: number, dy: number): number[] {
  return points.map((value, index) => value + (index % 2 === 0 ? dx : dy))
}

export function reversePoints(points: readonly number[]): number[] {
  const reversed: number[] = []
  for (let index = points.length - 2; index >= 0; index -= 2) reversed.push(points[index]!, points[index + 1]!)
  return reversed
}

export function rotateVector(vector: Vec, degrees: number): Vec {
  const radians = degrees * Math.PI / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return { x: vector.x * cos - vector.y * sin, y: vector.x * sin + vector.y * cos }
}

export function localToWorld(origin: { x: number; y: number; rotation: number }, local: Vec): Vec {
  const rotated = rotateVector(local, origin.rotation)
  return { x: origin.x + rotated.x, y: origin.y + rotated.y }
}

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Heading of a segment in degrees where 0 points to map-up (-y). */
export function headingDegrees(from: Vec, to: Vec): number {
  return normalizeDegrees(Math.atan2(to.x - from.x, -(to.y - from.y)) * 180 / Math.PI)
}

export function closestPointOnSegment(point: Vec, a: Vec, b: Vec): { point: Vec; t: number; distance: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared))
  const closest = { x: a.x + dx * t, y: a.y + dy * t }
  return { point: closest, t, distance: distance(point, closest) }
}

/** Finds the segment of a polyline nearest to a point. */
export function closestSegment(points: readonly number[], point: Vec): { segment: number; point: Vec; distance: number } | undefined {
  let best: { segment: number; point: Vec; distance: number } | undefined
  for (let segment = 0; segment < pointCount(points) - 1; segment += 1) {
    const hit = closestPointOnSegment(point, pointAt(points, segment), pointAt(points, segment + 1))
    if (!best || hit.distance < best.distance) best = { segment, point: hit.point, distance: hit.distance }
  }
  return best
}

/** Ramer–Douglas–Peucker simplification for freehand strokes. */
export function simplifyPath(points: readonly number[], tolerance: number): number[] {
  const count = pointCount(points)
  if (count <= 2) return [...points]
  const keep = new Uint8Array(count)
  keep[0] = 1
  keep[count - 1] = 1
  const stack: Array<[number, number]> = [[0, count - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    let farthest = -1
    let farthestDistance = tolerance
    const a = pointAt(points, start)
    const b = pointAt(points, end)
    for (let index = start + 1; index < end; index += 1) {
      const hit = closestPointOnSegment(pointAt(points, index), a, b)
      if (hit.distance > farthestDistance) { farthest = index; farthestDistance = hit.distance }
    }
    if (farthest >= 0) {
      keep[farthest] = 1
      stack.push([start, farthest], [farthest, end])
    }
  }
  const result: number[] = []
  for (let index = 0; index < count; index += 1) if (keep[index]) result.push(points[index * 2]!, points[index * 2 + 1]!)
  return result
}

/** Midpoint and heading of the longest segment, used to place length labels. */
export function labelAnchor(points: readonly number[]): { x: number; y: number; angle: number } {
  let best = 0
  let bestLength = -1
  for (let segment = 0; segment < pointCount(points) - 1; segment += 1) {
    const length = distance(pointAt(points, segment), pointAt(points, segment + 1))
    if (length > bestLength) { best = segment; bestLength = length }
  }
  const a = pointAt(points, best)
  const b = pointAt(points, Math.min(best + 1, pointCount(points) - 1))
  let angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI
  if (angle > 90) angle -= 180
  if (angle < -90) angle += 180
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle }
}

export function boundsOfPoints(points: readonly number[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let index = 0; index + 1 < points.length; index += 2) {
    minX = Math.min(minX, points[index]!)
    maxX = Math.max(maxX, points[index]!)
    minY = Math.min(minY, points[index + 1]!)
    maxY = Math.max(maxY, points[index + 1]!)
  }
  return { minX, minY, maxX, maxY }
}
