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
