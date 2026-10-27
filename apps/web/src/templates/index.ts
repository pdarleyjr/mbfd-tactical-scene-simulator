import { SCENE_SCHEMA_VERSION, type Board, type Scenario, type SceneObject } from '@mbfd/domain'
import type { ScenarioTemplate } from './types'
import { waterfrontEstate } from './waterfront-estate'
import { oceanfrontCondo } from './oceanfront-condo'

export type { ScenarioTemplate }

export const templates: readonly ScenarioTemplate[] = [waterfrontEstate, oceanfrontCondo]
export const defaultTemplate = templates[0]!

export function findTemplate(id: string | null | undefined): ScenarioTemplate | undefined {
  return templates.find((template) => template.id === id)
}

export function boardFromScenario(scenario: Scenario, objects: readonly SceneObject[], options: { name?: string; templateId?: string | null } = {}): Board {
  const now = new Date().toISOString()
  return {
    schemaVersion: SCENE_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name: options.name ?? scenario.title,
    templateId: options.templateId ?? null,
    createdAt: now,
    updatedAt: now,
    scenario: structuredClone(scenario),
    objects: structuredClone([...objects]),
    training: { timer: { running: false, startedAt: null, accumulatedMs: 0 }, revealed: {}, completed: {}, notes: '' },
    snapshots: [],
    run: null,
  }
}

export function boardFromTemplate(template: ScenarioTemplate = defaultTemplate, name?: string): Board {
  return boardFromScenario(template.scenario, template.objects, { name: name ?? template.scenario.title, templateId: template.id })
}
