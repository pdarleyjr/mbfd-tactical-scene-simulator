import type { Scenario } from '@mbfd/domain'

/**
 * Drawing for the flame and smoke-plume markers. Each draws around its own
 * origin, pointing up its own frame (the marker's rotation turns it), at size
 * `r` (the marker's radius, in map units) stretched in height by `stretch`,
 * for time `t` in seconds, so the same code serves the live map, the replay, and PNG export.
 */

/** A stable 0–1 number per object, so every flame flickers differently but the same on every screen. */
export function effectSeed(id: string): number {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619)
  return (hash >>> 0) / 4294967296
}

/** Screen direction smoke drifts toward, in degrees clockwise from up; straight up when no wind is set. */
export function downwindDegrees(conditions: Scenario['conditions']): number {
  if (conditions.windFromDeg === null) return 0
  return (((conditions.northDeg + conditions.windFromDeg + 180) % 360) + 360) % 360
}

/** Opacity for a CSS color string. Tiny numbers would print as 1e-7, which is not a valid color. */
function alpha(value: number): string {
  return Math.min(1, Math.max(0, value)).toFixed(3)
}

/**
 * The area you tap and drag to move an effect, in its own frame: the flame
 * itself, or the base of a smoke plume (so the long plume never blocks the map).
 */
export function effectBounds(kind: 'flame' | 'smoke', r: number, stretch = 1) {
  if (kind === 'smoke') return { x: -0.8 * r, y: -2.2 * r * stretch, width: 1.6 * r, height: 2.2 * r * stretch + 0.8 * r }
  return { x: -0.95 * r, y: -1.95 * r * stretch, width: 1.9 * r, height: 1.95 * r * stretch + 0.35 * r }
}

function tongue(ctx: CanvasRenderingContext2D, x: number, width: number, height: number, sway: number, colors: readonly string[]) {
  const gradient = ctx.createLinearGradient(0, 0, 0, -height)
  colors.forEach((color, index) => gradient.addColorStop(index / (colors.length - 1), color))
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.moveTo(x - width, 0)
  ctx.bezierCurveTo(x - width, -height * 0.45, x + sway - width * 0.25, -height * 0.72, x + sway, -height)
  ctx.bezierCurveTo(x + sway + width * 0.25, -height * 0.72, x + width, -height * 0.45, x + width, 0)
  ctx.quadraticCurveTo(x, width * 0.7, x - width, 0)
  ctx.fill()
}

const OUTER = ['rgba(255,196,64,0.95)', 'rgba(250,110,24,0.85)', 'rgba(214,40,12,0.55)', 'rgba(170,20,8,0)'] as const
const HALO = ['rgba(255,150,40,0.22)', 'rgba(255,100,20,0.14)', 'rgba(230,60,10,0.06)', 'rgba(200,40,0,0)'] as const
const INNER = ['rgba(255,252,214,1)', 'rgba(255,214,90,0.95)', 'rgba(255,140,30,0.6)', 'rgba(255,110,20,0)'] as const

export function drawFlame(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number, stretch = 1) {
  const phase = seed * Math.PI * 2
  // Warm glow on the ground and the building around the fire.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const flicker = 0.85 + 0.15 * Math.sin(t * 9 + phase)
  const glowY = -r * 0.2 * stretch
  const glow = ctx.createRadialGradient(0, glowY, 0, 0, glowY, r * 1.9)
  glow.addColorStop(0, `rgba(255,150,40,${alpha(0.42 * flicker)})`)
  glow.addColorStop(1, 'rgba(255,80,0,0)')
  ctx.fillStyle = glow
  ctx.beginPath()
  ctx.arc(0, glowY, r * 1.9, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // A soft halo behind the tongues: wider, faint copies drawn additively. Much
  // cheaper than canvas blur, which stalls slower PCs and software rendering.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  for (let index = 0; index < 3; index += 1) {
    const k = index - 1
    const height = stretch * r * (1.75 - Math.abs(k) * 0.35) * (0.9 + 0.1 * Math.sin(t * 6 + phase + index))
    tongue(ctx, k * r * 0.6, r * 0.62, height, r * 0.12 * Math.sin(t * 4.1 + phase + index), HALO)
  }
  ctx.restore()

  ctx.save()
  const count = 7
  for (let index = 0; index < count; index += 1) {
    const k = index / (count - 1) - 0.5
    const own = phase + index * 1.7
    const height = stretch * r * (1.15 + 0.55 * Math.cos(k * Math.PI)) * (0.86 + 0.14 * Math.sin(t * 7.3 + own) + 0.06 * Math.sin(t * 13.1 + own * 2))
    tongue(ctx, k * r * 1.25, r * (0.34 - Math.abs(k) * 0.12), height, r * 0.16 * Math.sin(t * 5.2 + own), OUTER)
  }
  for (let index = 0; index < 3; index += 1) {
    const k = index - 1
    const own = phase + 10 + index * 2.3
    const height = stretch * r * (0.85 - Math.abs(k) * 0.2) * (0.88 + 0.12 * Math.sin(t * 9.1 + own))
    tongue(ctx, k * r * 0.32, r * 0.2, height, r * 0.1 * Math.sin(t * 6.4 + own), INNER)
  }
  ctx.restore()
  // A few embers lifting off.
  for (let index = 0; index < 5; index += 1) {
    const age = (t * 0.55 + seed + index / 5) % 1
    ctx.fillStyle = `rgba(255,${180 - Math.round(age * 90)},60,${alpha(0.9 * (1 - age))})`
    ctx.beginPath()
    ctx.arc(Math.sin(index * 2.1 + t * 1.3 + phase) * r * 0.55, -r * stretch * (0.4 + age * 1.9), r * 0.045, 0, Math.PI * 2)
    ctx.fill()
  }
}

export function drawSmoke(ctx: CanvasRenderingContext2D, r: number, t: number, seed: number, downwindDeg = 0, stretch = 1) {
  const angle = (downwindDeg * Math.PI) / 180
  const dx = Math.sin(angle)
  const dy = -Math.cos(angle)
  const puffs = 18
  for (let index = puffs - 1; index >= 0; index -= 1) {
    const age = (t * 0.11 + seed + index / puffs) % 1
    const along = age * r * 6.5 * stretch
    const wobble = Math.sin(t * 0.8 + index * 1.7 + seed * 6) * r * 0.55 * age
    const x = dx * along - dy * wobble
    const y = dy * along + dx * wobble
    const size = r * (0.42 + age * 1.7)
    const opacity = 0.95 * Math.pow(1 - age, 0.75) * Math.min(1, age * 6)
    // Dark at the source, lightening to grey as it rises, so it reads over roofs and trees alike.
    const shade = Math.round(46 + age * 104)
    const puff = ctx.createRadialGradient(x, y, 0, x, y, size)
    puff.addColorStop(0, `rgba(${shade},${shade},${shade + 3},${alpha(opacity)})`)
    puff.addColorStop(0.55, `rgba(${shade},${shade},${shade + 3},${alpha(opacity * 0.8)})`)
    puff.addColorStop(1, `rgba(${shade},${shade},${shade + 3},0)`)
    ctx.fillStyle = puff
    ctx.beginPath()
    ctx.arc(x, y, size, 0, Math.PI * 2)
    ctx.fill()
  }
  // Dense, dark smoke right at the source.
  const base = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.75)
  base.addColorStop(0, 'rgba(30,30,32,0.85)')
  base.addColorStop(1, 'rgba(30,30,32,0)')
  ctx.fillStyle = base
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.75, 0, Math.PI * 2)
  ctx.fill()
}
