export interface Point {
  x: number
  y: number
}

export interface ViewportTransform extends Point {
  scale: number
}

export function fitWorldToViewport(
  world: { width: number; height: number },
  viewport: { width: number; height: number },
  padding = 0,
): ViewportTransform {
  const usableWidth = Math.max(1, viewport.width - padding * 2)
  const usableHeight = Math.max(1, viewport.height - padding * 2)
  const scale = Math.min(usableWidth / world.width, usableHeight / world.height)
  return {
    scale,
    x: (viewport.width - world.width * scale) / 2,
    y: (viewport.height - world.height * scale) / 2,
  }
}

export function screenToWorld(point: Point, viewport: ViewportTransform): Point {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  }
}

export function worldToScreen(point: Point, viewport: ViewportTransform): Point {
  return {
    x: point.x * viewport.scale + viewport.x,
    y: point.y * viewport.scale + viewport.y,
  }
}

export function zoomAroundPoint(
  viewport: ViewportTransform,
  anchor: Point,
  nextScale: number,
  limits = { min: 0.15, max: 6 },
): ViewportTransform {
  const scale = Math.min(limits.max, Math.max(limits.min, nextScale))
  const worldAnchor = screenToWorld(anchor, viewport)
  return {
    scale,
    x: anchor.x - worldAnchor.x * scale,
    y: anchor.y - worldAnchor.y * scale,
  }
}

export function pinchViewport(
  viewport: ViewportTransform,
  previous: { distance: number; center: Point },
  next: { distance: number; center: Point },
  limits = { min: 0.15, max: 6 },
): ViewportTransform {
  if (previous.distance <= 0 || next.distance <= 0) return viewport
  const scale = Math.min(limits.max, Math.max(limits.min, viewport.scale * next.distance / previous.distance))
  const worldAnchor = screenToWorld(previous.center, viewport)
  return {
    scale,
    x: next.center.x - worldAnchor.x * scale,
    y: next.center.y - worldAnchor.y * scale,
  }
}
