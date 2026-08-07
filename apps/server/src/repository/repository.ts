import type { ScenarioInput } from '@mbfd/domain'
import type { ParticipantRecord, ScenarioAssetRecord, ScenarioRecord, SessionRecord, StoredDomainEvent } from '../model.js'

export interface TacticalRepository {
  initialize(): Promise<void>
  close(): Promise<void>
  listScenarios(): Promise<ScenarioRecord[]>
  getScenario(id: string): Promise<ScenarioRecord | undefined>
  createScenario(input: ScenarioInput & { id?: string; slug?: string }): Promise<ScenarioRecord>
  updateScenario(id: string, input: Partial<ScenarioInput>): Promise<ScenarioRecord | undefined>
  deleteScenario(id: string): Promise<boolean>
  addScenarioAsset(asset: ScenarioAssetRecord): Promise<void>
  createSession(input: Omit<SessionRecord, 'id' | 'code' | 'createdAt' | 'updatedAt'>): Promise<SessionRecord>
  listSessions(): Promise<SessionRecord[]>
  getSession(id: string): Promise<SessionRecord | undefined>
  getSessionByCode(code: string): Promise<SessionRecord | undefined>
  updateSession(id: string, update: Partial<SessionRecord>): Promise<SessionRecord | undefined>
  addParticipant(participant: ParticipantRecord): Promise<void>
  listParticipants(sessionId: string): Promise<ParticipantRecord[]>
  appendEvent(event: StoredDomainEvent): Promise<void>
  listEvents(sessionId: string): Promise<StoredDomainEvent[]>
  loadYDocument(name: string): Promise<Uint8Array | undefined>
  saveYDocument(name: string, state: Uint8Array): Promise<void>
}
