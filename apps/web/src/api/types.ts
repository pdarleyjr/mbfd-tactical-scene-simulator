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
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface SessionView {
  id: string
  roomId: string
  scenarioId: string
  participatingUnits: string[]
  mode300: Mode300
  status: 'setup' | 'running' | 'frozen' | 'complete'
  createdAt: string
  startedAt?: string
  elapsedMs: number
  presentationMode: 'operations' | '300-plan' | 'split' | 'overlay'
}

export interface RoomView {
  id: string
  name: string
  locked: boolean
  archived: boolean
  updatedAt: string
  currentSession?: Pick<SessionView, 'id' | 'status' | 'participatingUnits'> & { scenarioTitle: string }
}

export interface UnitStatusView {
  sessionId: string
  unit: string
  status: 'staged' | 'arrived'
  arrivedAt?: string
}

export interface EvolutionRunView {
  id: string
  sessionId: string
  unit: string
  evolutionId: string
  label: string
  status: 'active' | 'complete'
  startedAt: string
  startedElapsedMs: number
  startedByName: string
  completedAt?: string
  completedElapsedMs?: number
}

export interface SessionBenchmarkView {
  id: string
  sessionId: string
  sourceBenchmarkId: string
  label: string
  description: string
  completedAt?: string
  completedElapsedMs?: number
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
  room?: Pick<RoomView, 'id' | 'name' | 'locked'>
  scenario: ScenarioView
  participants: ParticipantView[]
  units: UnitStatusView[]
  evolutions: EvolutionRunView[]
  benchmarks: SessionBenchmarkView[]
  role: string
}

export interface ActivityResponse {
  session: Pick<SessionView, 'id' | 'status' | 'startedAt'>
  units: UnitStatusView[]
  evolutions: EvolutionRunView[]
  benchmarks: SessionBenchmarkView[]
  events: Array<{ id: string; elapsedMs: number; occurredAt: string; actorName: string; actorUnit: string; eventType: string; metadata: Record<string, unknown> }>
}
