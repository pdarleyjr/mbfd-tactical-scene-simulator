import { findMarker, type FireLayout, type MarkerObject, type Scenario, type SceneObject } from '@mbfd/domain'
import { createMarker, newId, UNCALIBRATED_UNITS_PER_FT, type Vec } from '@mbfd/fire-model'
import { downwindDegrees } from '../canvas/effects'

/**
 * Fire on the map: the Fire tool's choices, and fire layouts (saved
 * arrangements of flames and smoke that turn one scene into several
 * scenarios). Pure functions over scene objects; the callers commit them.
 */

export type FireKind = 'flames' | 'smoke' | 'both'
export type FireSize = 'small' | 'medium' | 'large'

/** Radius in feet for each choice. Medium matches the marker catalog's default size. */
export const FIRE_SIZE_FT: Record<'flames' | 'smoke', Record<FireSize, number>> = {
  flames: { small: 7, medium: 12, large: 20 },
  smoke: { small: 12, medium: 18, large: 30 },
}

export function isEffectMarker(object: SceneObject | undefined): object is MarkerObject {
  return object?.type === 'marker' && Boolean(findMarker(object.markerType)?.effect)
}

/**
 * New fire at a point. "Both" puts a smoke plume on the same spot, under the
 * flames, drifting downwind when wind is set.
 */
export function createFire(kind: FireKind, size: FireSize, at: Vec, scenario: Pick<Scenario, 'calibration' | 'conditions'>): MarkerObject[] {
  const unitsPerFt = scenario.calibration ? 1 / scenario.calibration.feetPerWorldUnit : UNCALIBRATED_UNITS_PER_FT
  const make = (type: 'flames' | 'smoke') => {
    const marker = createMarker(type, at, scenario.calibration?.feetPerWorldUnit)
    const radius = Math.min(5000, FIRE_SIZE_FT[type][size] * unitsPerFt)
    return { ...marker, radius, ...(type === 'smoke' ? { rotation: downwindDegrees(scenario.conditions) } : {}) }
  }
  if (kind === 'flames') return [make('flames')]
  if (kind === 'smoke') return [make('smoke')]
  return [make('smoke'), make('flames')]
}

/** Which size choice a fire is closest to, for showing in the inspector. */
export function fireSizeOf(marker: MarkerObject, feetPerUnit: number | undefined): FireSize | undefined {
  if ((marker.markerType !== 'flames' && marker.markerType !== 'smoke') || marker.radius === undefined) return undefined
  const feet = marker.radius * (feetPerUnit ?? 1 / UNCALIBRATED_UNITS_PER_FT)
  const sizes = FIRE_SIZE_FT[marker.markerType]
  return (Object.keys(sizes) as FireSize[]).find((size) => Math.abs(sizes[size] - feet) < 0.5)
}

export function fireRadiusFor(marker: MarkerObject, size: FireSize, feetPerUnit: number | undefined): number | undefined {
  if (marker.markerType !== 'flames' && marker.markerType !== 'smoke') return undefined
  return Math.min(5000, FIRE_SIZE_FT[marker.markerType][size] / (feetPerUnit ?? 1 / UNCALIBRATED_UNITS_PER_FT))
}

export function nextLayoutName(layouts: readonly FireLayout[]): string {
  const used = new Set(layouts.map((layout) => layout.name.toLowerCase()))
  for (let count = layouts.length + 1; ; count += 1) if (!used.has(`fire layout ${count}`)) return `Fire layout ${count}`
}

/** Captures the flames and smoke on the map as a layout. */
export function fireLayoutFrom(objects: readonly SceneObject[], name: string, id: string = newId()): FireLayout {
  return { id, name: name.trim().slice(0, 60) || 'Fire layout', effects: objects.filter(isEffectMarker).slice(0, 200).map((effect) => structuredClone(effect)) }
}

/** The map with its fire swapped for a layout's; nothing else moves. */
export function applyFireLayout(objects: readonly SceneObject[], layout: FireLayout): SceneObject[] {
  return [...objects.filter((object) => !isEffectMarker(object)), ...layout.effects.filter(isEffectMarker).map((effect) => ({ ...structuredClone(effect), id: newId() }))]
}

export function removeAllFire(objects: readonly SceneObject[]): SceneObject[] {
  return objects.filter((object) => !isEffectMarker(object))
}

function fingerprint(effect: MarkerObject): string {
  const round = (value: number | undefined) => value === undefined ? '' : Math.round(value * 100) / 100
  return [effect.markerType, round(effect.x), round(effect.y), round(effect.rotation), round(effect.radius), round(effect.stretch ?? 1), effect.label].join('|')
}

/** Whether the fire on the map is exactly a layout's (ids aside), so the tray can say which one is showing. */
export function layoutMatches(objects: readonly SceneObject[], layout: FireLayout): boolean {
  const current = objects.filter(isEffectMarker).map(fingerprint).sort()
  const saved = layout.effects.filter(isEffectMarker).map(fingerprint).sort()
  return current.length === saved.length && current.every((value, index) => value === saved[index])
}
