import { useEffect, useRef } from 'react'
import { Layer, Shape } from 'react-konva'
import Konva from 'konva'
import type { MarkerObject } from '@mbfd/domain'
import { drawFlame, drawSmoke, effectSeed } from '../effects'

/** 30 frames a second normally; half that on a map crowded with effects. */
const frameMs = (count: number) => 1000 / (count > 24 ? 15 : 30)
/** Animation time shared by every effect, in seconds. */
let clock = 0

function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Flames and smoke plumes, drawn under the units and hose so they never hide
 * them. Only this layer redraws for the animation, and only while at least one
 * effect is on the map; with reduced motion they are drawn once, still.
 */
export function EffectsLayer({ effects, downwindDeg }: { effects: readonly MarkerObject[]; downwindDeg: number }) {
  const layerRef = useRef<Konva.Layer>(null)
  const animate = effects.length > 0 && !prefersReducedMotion()
  const frame = frameMs(effects.length)

  useEffect(() => {
    const layer = layerRef.current
    if (!animate || !layer) return
    let last = -frame
    const animation = new Konva.Animation((tick) => {
      if (!tick || tick.time - last < frame) return false
      last = tick.time
      clock = tick.time / 1000
      return true
    }, layer)
    animation.start()
    return () => { animation.stop() }
  }, [animate, frame])

  return (
    <Layer ref={layerRef} listening={false}>
      {effects.map((effect) => {
        const radius = effect.radius ?? 20
        const seed = effectSeed(effect.id)
        return (
          <Shape
            key={effect.id}
            x={effect.x}
            y={effect.y}
            name="effect"
            perfectDrawEnabled={false}
            sceneFunc={(context, shape) => {
              const ctx = context._context
              if (effect.markerType === 'smoke') drawSmoke(ctx, radius, clock, seed, downwindDeg)
              // Canvas blur is in screen pixels, so it follows the zoom.
              else drawFlame(ctx, radius, clock, seed, radius * 0.18 * shape.getAbsoluteScale().x)
            }}
          />
        )
      })}
    </Layer>
  )
}
