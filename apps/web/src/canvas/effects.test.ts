import { describe, expect, it, vi } from 'vitest'
import { downwindDegrees, drawFlame, drawSmoke, effectSeed } from './effects'

const calm = { windFromDeg: null, windNote: '', northDeg: 0, weather: '' }

/** Records drawing calls on a stand-in canvas context. */
function fakeContext() {
  const gradient = { addColorStop: vi.fn() }
  return {
    ctx: {
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), bezierCurveTo: vi.fn(), quadraticCurveTo: vi.fn(), arc: vi.fn(), fill: vi.fn(),
      createLinearGradient: vi.fn(() => gradient), createRadialGradient: vi.fn(() => gradient), fillStyle: '', globalCompositeOperation: 'source-over',
    } as unknown as CanvasRenderingContext2D,
    gradient,
  }
}

describe('effect helpers', () => {
  it('gives each object a stable seed between 0 and 1', () => {
    expect(effectSeed('abc')).toBe(effectSeed('abc'))
    expect(effectSeed('abc')).not.toBe(effectSeed('abd'))
    for (const id of ['a', 'flame-1', crypto.randomUUID()]) {
      expect(effectSeed(id)).toBeGreaterThanOrEqual(0)
      expect(effectSeed(id)).toBeLessThan(1)
    }
  })

  it('sends smoke downwind, or straight up when no wind is set', () => {
    expect(downwindDegrees(calm)).toBe(0)
    expect(downwindDegrees({ ...calm, windFromDeg: 90 })).toBe(270)
    expect(downwindDegrees({ ...calm, windFromDeg: 270, northDeg: 30 })).toBe(120)
  })

  it('draws flames and smoke without leaving the canvas in a changed state', () => {
    const flame = fakeContext()
    drawFlame(flame.ctx, 20, 1.5, 0.3, 6)
    expect(flame.ctx.save).toHaveBeenCalledTimes(2)
    expect(flame.ctx.restore).toHaveBeenCalledTimes(2)
    expect((flame.ctx.fill as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(10)
    const smoke = fakeContext()
    drawSmoke(smoke.ctx, 20, 1.5, 0.3, 90)
    expect((smoke.ctx.arc as ReturnType<typeof vi.fn>).mock.calls.length).toBe(19)
  })

  it('only ever produces valid CSS colors, even for an almost invisible puff', () => {
    // At this moment one puff is a hair past its start, so its opacity is about 1e-7.
    const { ctx, gradient } = fakeContext()
    drawSmoke(ctx, 20, 1e-6, 0, 0)
    drawFlame(ctx, 20, 1e-6, 0.999999)
    const colors = gradient.addColorStop.mock.calls.map((call) => String(call[1]))
    expect(colors.length).toBeGreaterThan(20)
    for (const color of colors) expect(color).toMatch(/^rgba\(\d+,\d+,\d+,(0|1)(\.\d+)?\)$/)
  })
})
