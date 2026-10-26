import type { Calibration, HoseLoads, SceneObject } from '@mbfd/domain'
import { analyzeWaterSupply, type WaterSupplyReport } from '@mbfd/fire-model'
import { useBoard } from './board'

type Entry = { objects: readonly SceneObject[]; loads: HoseLoads; calibration: Calibration | undefined; report: WaterSupplyReport }
const recent: Entry[] = []

/**
 * Water-supply analysis shared by the map, top bar, inspector, and panel. Keyed
 * on object identity, so one drag frame computes it once rather than per view.
 * Two slots cover the live board and a replay frame shown at the same time.
 */
export function waterSupplyFor(objects: readonly SceneObject[], loads: HoseLoads, calibration: Calibration | undefined): WaterSupplyReport {
  const hit = recent.find((entry) => entry.objects === objects && entry.loads === loads && entry.calibration === calibration)
  if (hit) return hit.report
  const report = analyzeWaterSupply(objects, { loads, calibration })
  recent.unshift({ objects, loads, calibration, report })
  recent.length = Math.min(recent.length, 2)
  return report
}

export function useWaterSupply(): WaterSupplyReport {
  const objects = useBoard((state) => state.board.objects)
  const loads = useBoard((state) => state.board.scenario.hoseLoads)
  const calibration = useBoard((state) => state.board.scenario.calibration)
  return waterSupplyFor(objects, loads, calibration)
}
