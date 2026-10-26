import type { Scenario, SceneObject } from '@mbfd/domain'

export interface ScenarioTemplate {
  id: string
  version: number
  scenario: Scenario
  objects: readonly SceneObject[]
}
