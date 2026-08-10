import type { ScenarioInput } from '@mbfd/domain'
import type { EvolutionRunRecord, ParticipantRecord, RoomRecord, ScenarioAssetRecord, ScenarioRecord, SessionBenchmarkRecord, SessionRecord, StoredDomainEvent, UnitStatusRecord } from '../model.js'

export interface TacticalRepository {
  initialize(): Promise<void>
  close(): Promise<void>
  listScenarios(): Promise<ScenarioRecord[]>
  getScenario(id: string): Promise<ScenarioRecord | undefined>
  createScenario(input: ScenarioInput & { id?: string; slug?: string }): Promise<ScenarioRecord>
  updateScenario(id: string, input: Partial<ScenarioInput>): Promise<ScenarioRecord | undefined>
  deleteScenario(id: string): Promise<boolean>
  addScenarioAsset(asset: ScenarioAssetRecord): Promise<void>
  createRoom(input: { name: string; accessPinHash?: string }): Promise<RoomRecord>
  listRooms(): Promise<RoomRecord[]>
  getRoom(id: string): Promise<RoomRecord | undefined>
  updateRoom(id: string, update: Partial<Pick<RoomRecord, 'name' | 'accessPinHash' | 'archived'>> & { clearAccessPin?: boolean }): Promise<RoomRecord | undefined>
  createSession(input: Omit<SessionRecord, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'accumulatedElapsedMs'> & { accumulatedElapsedMs?: number }): Promise<SessionRecord>
  listSessions(): Promise<SessionRecord[]>
  getSession(id: string): Promise<SessionRecord | undefined>
  getSessionByCode(code: string): Promise<SessionRecord | undefined>
  updateSession(id: string, update: Partial<SessionRecord> & { clearTimerAnchor?: boolean }): Promise<SessionRecord | undefined>
  replaceSessionUnits(sessionId: string, units: string[]): Promise<UnitStatusRecord[]>
  listUnitStatuses(sessionId: string): Promise<UnitStatusRecord[]>
  getUnitStatus(sessionId: string, unit: string): Promise<UnitStatusRecord | undefined>
  updateUnitStatus(sessionId: string, unit: string, update: Partial<UnitStatusRecord> & { clearArrival?: boolean }): Promise<UnitStatusRecord | undefined>
  replaceSessionBenchmarks(sessionId: string, benchmarks: Array<{ sourceBenchmarkId: string; label: string; description: string }>): Promise<SessionBenchmarkRecord[]>
  listSessionBenchmarks(sessionId: string): Promise<SessionBenchmarkRecord[]>
  getSessionBenchmark(id: string): Promise<SessionBenchmarkRecord | undefined>
  updateSessionBenchmark(id: string, update: Partial<SessionBenchmarkRecord> & { clearCompletion?: boolean }): Promise<SessionBenchmarkRecord | undefined>
  createEvolutionRun(input: Omit<EvolutionRunRecord, 'id'>): Promise<EvolutionRunRecord>
  getEvolutionRun(id: string): Promise<EvolutionRunRecord | undefined>
  listEvolutionRuns(sessionId: string): Promise<EvolutionRunRecord[]>
  updateEvolutionRun(id: string, update: Partial<EvolutionRunRecord>): Promise<EvolutionRunRecord | undefined>
  addParticipant(participant: ParticipantRecord): Promise<void>
  listParticipants(sessionId: string): Promise<ParticipantRecord[]>
  appendEvent(event: StoredDomainEvent): Promise<void>
  listEvents(sessionId: string): Promise<StoredDomainEvent[]>
  loadYDocument(name: string): Promise<Uint8Array | undefined>
  saveYDocument(name: string, state: Uint8Array): Promise<void>
}
