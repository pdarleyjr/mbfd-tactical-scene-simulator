import type { DomainEvent, Mode300, ScenarioInput } from '@mbfd/domain'

export interface ScenarioAssetRecord {
  id: string
  scenarioId: string
  kind: 'background' | 'video' | 'apparatus' | 'other'
  originalPath: string
  runtimePath: string
  thumbnailPath?: string
  posterPath?: string
  mimeType: string
  byteSize: number
  width?: number
  height?: number
  sha256: string
  createdAt: string
}

export interface ScenarioRecord extends ScenarioInput {
  id: string
  slug: string
  backgroundAssetId?: string
  videoAssetId?: string
  assets: ScenarioAssetRecord[]
  createdAt: string
  updatedAt: string
}

export interface SessionRecord {
  id: string
  code: string
  roomId: string
  scenarioId: string
  participatingUnits: string[]
  mode300: Mode300
  status: 'setup' | 'running' | 'frozen' | 'complete'
  startedAt?: string
  createdAt: string
  updatedAt: string
  frozen300Plan?: Uint8Array
  presentationMode: 'operations' | '300-plan' | 'split' | 'overlay'
}

export interface RoomRecord {
  id: string
  name: string
  accessPinHash?: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

export interface UnitStatusRecord {
  sessionId: string
  unit: string
  status: 'staged' | 'arrived'
  arrivedAt?: string
  arrivedByClientId?: string
}

export interface EvolutionRunRecord {
  id: string
  sessionId: string
  unit: string
  evolutionId: string
  label: string
  status: 'active' | 'complete'
  startedAt: string
  startedElapsedMs: number
  startedByClientId: string
  startedByName: string
  completedAt?: string
  completedElapsedMs?: number
  completedByClientId?: string
}

export interface SessionBenchmarkRecord {
  id: string
  sessionId: string
  sourceBenchmarkId: string
  label: string
  description: string
  completedAt?: string
  completedElapsedMs?: number
  completedByClientId?: string
  createdAt: string
}

export interface ParticipantRecord {
  id: string
  sessionId: string
  clientId: string
  name: string
  unit: string
  role: 'crew' | 'command300' | 'instructor' | 'presentation'
  joinedAt: string
  lastSeenAt: string
}

export type StoredDomainEvent = DomainEvent
