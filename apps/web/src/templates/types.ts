import type { Scenario, SceneObject } from '@mbfd/domain'

export interface ScenarioTemplate {
  id: string
  version: number
  /** Small preview of the map for the scenario picker. */
  thumbnailUrl: string
  scenario: Scenario
  objects: readonly SceneObject[]
}
