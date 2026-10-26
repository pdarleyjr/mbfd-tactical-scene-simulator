export interface Point {
  x: number
  y: number
}

export interface ViewportTransform extends Point {
  scale: number
}

export const ZOOM_LIMITS = { min: 0.1, max: 10 }

export function fitWorldToViewport(
  world: { width: number; height: number },
  viewport: { width: number; height: number },
  padding: number | { top: number; right: number; bottom: number; left: number } = 0,
): ViewportTransform {
  const pad = typeof padding === 'number' ? { top: padding, right: padding, bottom: padding, left: padding } : padding
  const usableWidth = Math.max(1, viewport.width - pad.left - pad.right)
  const usableHeight = Math.max(1, viewport.height - pad.top - pad.bottom)
  const scale = Math.min(usableWidth / world.width, usableHeight / world.height)
  return {
    scale,
    x: pad.left + (usableWidth - world.width * scale) / 2,
    y: pad.top + (usableHeight - world.height * scale) / 2,
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
  limits = ZOOM_LIMITS,
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
  limits = ZOOM_LIMITS,
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

/** Keeps the same world point at the center when the host element resizes. */
export function preserveCenterOnResize(
  viewport: ViewportTransform,
  previous: { width: number; height: number },
  next: { width: number; height: number },
): ViewportTransform {
  return { ...viewport, x: viewport.x + (next.width - previous.width) / 2, y: viewport.y + (next.height - previous.height) / 2 }
}
