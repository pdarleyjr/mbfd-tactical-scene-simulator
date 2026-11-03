/**
 * Hose length labels: how big they are and where they go.
 *
 * Labels are drawn in screen pixels (they keep the same size at every zoom),
 * upright so they read on a phone and across a classroom, in a solid pill
 * beside the line rather than on top of it. Each label tries a few spots along
 * its line's longest runs and takes the first one that is clear of other
 * labels, of apparatus, and of other lines.
 */

import { hoseCatalog, type HoseObject } from '@mbfd/domain'
import type { HoseReading } from '@mbfd/fire-model'

export interface ScreenRect { x: number; y: number; width: number; height: number }

/** What a line is for, in the words the department uses: 5″ supply, 3″ feeder, 1¾″ attack. */
export function hoseRole(hose: Pick<HoseObject, 'hoseType' | 'purpose'>): string {
  if (hose.hoseType === 'supply5') return 'supply'
  if (hose.hoseType === 'attack175') return 'attack'
  return hose.purpose === 'attack' ? 'attack' : 'feeder'
}

/** e.g. "5″ supply · 412 ft · 5 × 100′" or "1¾″ attack · 180 ft · 2 × 100′ · 30 ft over". */
export function hoseLabelText(hose: Pick<HoseObject, 'hoseType' | 'purpose'>, reading: HoseReading): string {
  const parts = [`${hoseCatalog[hose.hoseType].shortLabel} ${hoseRole(hose)}`, reading.length.text]
  if (reading.sections !== undefined) parts.push(`${reading.sections} × ${reading.sectionLengthFt}′`)
  if (reading.overLoadFt !== undefined) parts.push(`${Math.round(reading.overLoadFt)} ft over`)
  return parts.join(' · ')
}

export interface LabelRequest {
  id: string
  /** The line in world units, as x/y pairs. */
  points: readonly number[]
  text: string
  /** Stroke width of the line in screen pixels. */
  lineWidthPx: number
}

export interface PlacedLabel {
  id: string
  /** Center of the pill, in world units. */
  x: number
  y: number
  /** Pill size in screen pixels. */
  width: number
  height: number
  fontPx: number
  /** True when no clear spot was found and the label sits in its first-choice spot anyway. */
  crowded: boolean
}

export interface LabelMetrics { fontPx: number; padX: number; padY: number; height: number; strokePx: number }

/** Smallest and largest hose label text, in CSS pixels. */
export const LABEL_FONT_LIMITS = { min: 14, max: 36 }

/**
 * Text size for hose length labels. 16 px on laptops and tablets (up from
 * 12), 15 on phones, and 1.6× on 4K panels running at 100% scaling (the same
 * factor the chrome uses), a fifth larger again while presenting.
 */
export function lengthLabelFontPx(viewportWidth: number, presenting = false): number {
  const base = viewportWidth >= 2600 ? 16 * 1.6 : viewportWidth < 760 ? 15 : 16
  const size = Math.round(base * (presenting ? 1.2 : 1))
  return Math.min(LABEL_FONT_LIMITS.max, Math.max(LABEL_FONT_LIMITS.min, size))
}

export function labelMetrics(fontPx: number): LabelMetrics {
  const padX = Math.round(fontPx * 0.6)
  const padY = Math.round(fontPx * 0.3)
  return { fontPx, padX, padY, height: Math.round(fontPx * 1.1) + padY * 2, strokePx: fontPx >= 22 ? 3 : 2 }
}

let measureContext: CanvasRenderingContext2D | null | undefined

/** Width of a label's text in pixels; measured with the real font when a canvas is available. */
export function measureLabelText(text: string, fontPx: number): number {
  if (measureContext === undefined) {
    measureContext = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  if (measureContext) {
    measureContext.font = `700 ${fontPx}px Barlow, 'Source Sans 3 Variable', sans-serif`
    return measureContext.measureText(text).width
  }
  return text.length * fontPx * 0.56
}

export function rectsOverlap(a: ScreenRect, b: ScreenRect, gap = 0): boolean {
  return a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap
}

/** Whether a segment passes through a rectangle (both in the same units). */
export function segmentHitsRect(ax: number, ay: number, bx: number, by: number, rect: ScreenRect): boolean {
  // Liang-Barsky clipping against the rectangle.
  let t0 = 0
  let t1 = 1
  const dx = bx - ax
  const dy = by - ay
  const edges: Array<[number, number]> = [[-dx, ax - rect.x], [dx, rect.x + rect.width - ax], [-dy, ay - rect.y], [dy, rect.y + rect.height - ay]]
  for (const [p, q] of edges) {
    if (p === 0) { if (q < 0) return false; continue }
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t }
    else { if (t < t0) return false; if (t < t1) t1 = t }
  }
  return t0 <= t1
}

interface Segment { ax: number; ay: number; bx: number; by: number; owner: string }

const ALONG = [0.5, 0.32, 0.68, 0.18, 0.82]

/**
 * Places one label per line. Positions are worked out in screen pixels for the
 * given zoom (`scale` = screen pixels per world unit) and returned in world
 * units. `obstacles` are screen-pixel rectangles in the same space (world × scale).
 */
export function layoutLineLabels(requests: readonly LabelRequest[], scale: number, fontPx: number, obstacles: readonly ScreenRect[] = [], measure: (text: string, fontPx: number) => number = measureLabelText): PlacedLabel[] {
  const metrics = labelMetrics(fontPx)
  const segments: Segment[] = []
  for (const request of requests) {
    for (let index = 2; index + 1 < request.points.length; index += 2) {
      segments.push({ ax: request.points[index - 2]! * scale, ay: request.points[index - 1]! * scale, bx: request.points[index]! * scale, by: request.points[index + 1]! * scale, owner: request.id })
    }
  }
  const placed: ScreenRect[] = []
  const result: PlacedLabel[] = []
  for (const request of requests) {
    const width = Math.ceil(measure(request.text, fontPx)) + metrics.padX * 2
    const height = metrics.height
    const own = segments.filter((segment) => segment.owner === request.id)
      .map((segment) => ({ segment, length: Math.hypot(segment.bx - segment.ax, segment.by - segment.ay) }))
      .filter((item) => item.length > 0)
      .sort((a, b) => b.length - a.length)
      .slice(0, 3)
    if (!own.length) {
      const x = request.points[0] ?? 0
      const y = request.points[1] ?? 0
      result.push({ id: request.id, x, y, width, height, fontPx, crowded: true })
      continue
    }
    let best: { rect: ScreenRect; score: number } | undefined
    let first: ScreenRect | undefined
    for (const { segment, length } of own) {
      const ux = (segment.bx - segment.ax) / length
      const uy = (segment.by - segment.ay) / length
      // Unit normal; try the side "above" the line first so labels settle consistently.
      let nx = -uy
      let ny = ux
      if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny }
      // How far the pill reaches along the normal, so its edge clears the line.
      const reach = Math.abs(nx) * width / 2 + Math.abs(ny) * height / 2 + request.lineWidthPx / 2 + 4
      for (const t of ALONG) {
        for (const side of [1, -1]) {
          const cx = segment.ax + (segment.bx - segment.ax) * t + nx * reach * side
          const cy = segment.ay + (segment.by - segment.ay) * t + ny * reach * side
          const rect = { x: cx - width / 2, y: cy - height / 2, width, height }
          first ??= rect
          let score = 0
          for (const other of placed) if (rectsOverlap(rect, other, 4)) score += 1000
          for (const obstacle of obstacles) if (rectsOverlap(rect, obstacle)) score += 400
          for (const line of segments) if (segmentHitsRect(line.ax, line.ay, line.bx, line.by, rect)) score += line.owner === request.id ? 60 : 25
          if (!best || score < best.score) best = { rect, score }
          if (score === 0) break
        }
        if (best?.score === 0) break
      }
      if (best?.score === 0) break
    }
    const chosen = best?.rect ?? first!
    placed.push(chosen)
    result.push({ id: request.id, x: (chosen.x + chosen.width / 2) / scale, y: (chosen.y + chosen.height / 2) / scale, width, height, fontPx, crowded: (best?.score ?? 0) >= 1000 })
  }
  return result
}
