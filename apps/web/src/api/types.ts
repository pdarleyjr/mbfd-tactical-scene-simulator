import type { Mode300, ScenarioInput } from '@mbfd/domain'

export interface ScenarioAssetView {
  id: string
  kind: 'background' | 'video' | 'apparatus' | 'other'
  runtimeUrl: string
  thumbnailUrl?: string
  posterUrl?: string
  width?: number
  height?: number
}

export interface ScenarioView extends ScenarioInput {
  id: string
  slug: string
  assets: ScenarioAssetView[]
  backgroundAssetId?: string
  videoAssetId?: string
  createdAt: string
  updatedAt: string
}

export interface SessionView {
  id: string
  code: string
  scenarioId: string
  participatingUnits: string[]
  mode300: Mode300
  status: 'setup' | 'running' | 'frozen' | 'complete'
  createdAt: string
  startedAt?: string
  presentationMode: 'operations' | '300-plan' | 'split' | 'overlay'
}

export interface ParticipantView {
  clientId: string
  name: string
  unit: string
  role: 'crew' | 'command300' | 'instructor' | 'presentation'
  lastSeenAt: string
}

export interface BootstrapResponse {
  session: SessionView
  scenario: ScenarioView
  participants: ParticipantView[]
  role: string
}
