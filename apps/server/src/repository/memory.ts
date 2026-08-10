import { randomUUID } from 'node:crypto'
import type { ScenarioInput } from '@mbfd/domain'
import type { EvolutionRunRecord, ParticipantRecord, RoomRecord, ScenarioAssetRecord, ScenarioRecord, SessionBenchmarkRecord, SessionRecord, StoredDomainEvent, UnitStatusRecord } from '../model.js'
import { initialScenario } from '../seed.js'
import type { TacticalRepository } from './repository.js'

const roomAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function createRoomCode(): string {
  return Array.from({ length: 6 }, () => roomAlphabet[Math.floor(Math.random() * roomAlphabet.length)]).join('')
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

export class MemoryRepository implements TacticalRepository {
  private readonly scenarios = new Map<string, ScenarioRecord>([[initialScenario.id, structuredClone(initialScenario)]])
  private readonly sessions = new Map<string, SessionRecord>()
  private readonly rooms = new Map<string, RoomRecord>()
  private readonly unitStatuses = new Map<string, UnitStatusRecord>()
  private readonly benchmarks = new Map<string, SessionBenchmarkRecord>()
  private readonly evolutionRuns = new Map<string, EvolutionRunRecord>()
  private readonly participants: ParticipantRecord[] = []
  private readonly events: StoredDomainEvent[] = []
  private readonly documents = new Map<string, Uint8Array>()

  async initialize(): Promise<void> {}
  async close(): Promise<void> {}

  async listScenarios(): Promise<ScenarioRecord[]> {
    return [...this.scenarios.values()].map((scenario) => structuredClone(scenario))
  }

  async getScenario(id: string): Promise<ScenarioRecord | undefined> {
    const scenario = this.scenarios.get(id)
    return scenario ? structuredClone(scenario) : undefined
  }

  async createScenario(input: ScenarioInput & { id?: string; slug?: string }): Promise<ScenarioRecord> {
    const now = new Date().toISOString()
    const scenario: ScenarioRecord = {
      ...input,
      id: input.id ?? randomUUID(),
      slug: input.slug ?? slugify(input.title),
      assets: [],
      createdAt: now,
      updatedAt: now,
    }
    this.scenarios.set(scenario.id, scenario)
    return structuredClone(scenario)
  }

  async updateScenario(id: string, input: Partial<ScenarioInput>): Promise<ScenarioRecord | undefined> {
    const current = this.scenarios.get(id)
    if (!current) return undefined
    const updated = { ...current, ...input, id, updatedAt: new Date().toISOString() }
    this.scenarios.set(id, updated)
    return structuredClone(updated)
  }

  async deleteScenario(id: string): Promise<boolean> {
    if ([...this.sessions.values()].some((session) => session.scenarioId === id)) throw new Error('Scenario is used by a training session and cannot be deleted.')
    return this.scenarios.delete(id)
  }

  async addScenarioAsset(asset: ScenarioAssetRecord): Promise<void> {
    const scenario = this.scenarios.get(asset.scenarioId)
    if (!scenario) throw new Error('Scenario not found')
    scenario.assets.push(structuredClone(asset))
    if (asset.kind === 'background') scenario.backgroundAssetId = asset.id
    if (asset.kind === 'video') scenario.videoAssetId = asset.id
    scenario.updatedAt = new Date().toISOString()
  }

  async createRoom(input: { name: string; accessPinHash?: string }): Promise<RoomRecord> {
    const now = new Date().toISOString()
    const room: RoomRecord = { id: randomUUID(), name: input.name, ...(input.accessPinHash ? { accessPinHash: input.accessPinHash } : {}), archived: false, createdAt: now, updatedAt: now }
    this.rooms.set(room.id, room)
    return structuredClone(room)
  }

  async listRooms(): Promise<RoomRecord[]> {
    return [...this.rooms.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((room) => structuredClone(room))
  }

  async getRoom(id: string): Promise<RoomRecord | undefined> {
    const room = this.rooms.get(id)
    return room ? structuredClone(room) : undefined
  }

  async updateRoom(id: string, update: Partial<Pick<RoomRecord, 'name' | 'accessPinHash' | 'archived'>> & { clearAccessPin?: boolean }): Promise<RoomRecord | undefined> {
    const current = this.rooms.get(id)
    if (!current) return undefined
    const updated: RoomRecord = { ...current, ...update, id, updatedAt: new Date().toISOString() }
    delete (updated as RoomRecord & { clearAccessPin?: boolean }).clearAccessPin
    if (update.clearAccessPin) delete updated.accessPinHash
    this.rooms.set(id, updated)
    return structuredClone(updated)
  }

  async createSession(input: Omit<SessionRecord, 'id' | 'code' | 'createdAt' | 'updatedAt'>): Promise<SessionRecord> {
    let code = createRoomCode()
    while ([...this.sessions.values()].some((session) => session.code === code)) code = createRoomCode()
    const now = new Date().toISOString()
    const session: SessionRecord = { ...input, id: randomUUID(), code, createdAt: now, updatedAt: now }
    this.sessions.set(session.id, session)
    return structuredClone(session)
  }

  async listSessions(): Promise<SessionRecord[]> {
    const items = await Promise.all([...this.sessions.values()].reverse().map((session) => this.getSession(session.id)))
    return items.filter((item): item is SessionRecord => Boolean(item)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const session = this.sessions.get(id)
    if (!session) return undefined
    const cloned = structuredClone(session)
    return session.frozen300Plan ? { ...cloned, frozen300Plan: new Uint8Array(session.frozen300Plan) } : cloned
  }

  async getSessionByCode(code: string): Promise<SessionRecord | undefined> {
    const session = [...this.sessions.values()].find((candidate) => candidate.code === code.toUpperCase())
    if (!session) return undefined
    const cloned = structuredClone(session)
    return session.frozen300Plan ? { ...cloned, frozen300Plan: new Uint8Array(session.frozen300Plan) } : cloned
  }

  async updateSession(id: string, update: Partial<SessionRecord>): Promise<SessionRecord | undefined> {
    const current = this.sessions.get(id)
    if (!current) return undefined
    const updated = { ...current, ...update, id, code: current.code, updatedAt: new Date().toISOString() }
    this.sessions.set(id, updated)
    const cloned = structuredClone(updated)
    return updated.frozen300Plan ? { ...cloned, frozen300Plan: new Uint8Array(updated.frozen300Plan) } : cloned
  }

  async replaceSessionUnits(sessionId: string, units: string[]): Promise<UnitStatusRecord[]> {
    for (const key of [...this.unitStatuses.keys()]) if (key.startsWith(`${sessionId}:`)) this.unitStatuses.delete(key)
    const records = units.map((unit) => ({ sessionId, unit, status: 'staged' as const }))
    for (const record of records) this.unitStatuses.set(`${sessionId}:${record.unit}`, record)
    return structuredClone(records)
  }

  async listUnitStatuses(sessionId: string): Promise<UnitStatusRecord[]> {
    return [...this.unitStatuses.values()].filter((item) => item.sessionId === sessionId).map((item) => structuredClone(item))
  }

  async getUnitStatus(sessionId: string, unit: string): Promise<UnitStatusRecord | undefined> {
    const record = this.unitStatuses.get(`${sessionId}:${unit}`)
    return record ? structuredClone(record) : undefined
  }

  async updateUnitStatus(sessionId: string, unit: string, update: Partial<UnitStatusRecord> & { clearArrival?: boolean }): Promise<UnitStatusRecord | undefined> {
    const key = `${sessionId}:${unit}`
    const current = this.unitStatuses.get(key)
    if (!current) return undefined
    const updated: UnitStatusRecord = { ...current, ...update, sessionId, unit }
    delete (updated as UnitStatusRecord & { clearArrival?: boolean }).clearArrival
    if (update.clearArrival) { delete updated.arrivedAt; delete updated.arrivedByClientId }
    this.unitStatuses.set(key, updated)
    return structuredClone(updated)
  }

  async replaceSessionBenchmarks(sessionId: string, items: Array<{ sourceBenchmarkId: string; label: string; description: string }>): Promise<SessionBenchmarkRecord[]> {
    for (const [key, item] of this.benchmarks) if (item.sessionId === sessionId) this.benchmarks.delete(key)
    const createdAt = new Date().toISOString()
    const records = items.map((item) => ({ id: randomUUID(), sessionId, ...item, createdAt }))
    for (const record of records) this.benchmarks.set(record.id, record)
    return structuredClone(records)
  }

  async listSessionBenchmarks(sessionId: string): Promise<SessionBenchmarkRecord[]> {
    return [...this.benchmarks.values()].filter((item) => item.sessionId === sessionId).map((item) => structuredClone(item))
  }

  async getSessionBenchmark(id: string): Promise<SessionBenchmarkRecord | undefined> {
    const record = this.benchmarks.get(id)
    return record ? structuredClone(record) : undefined
  }

  async updateSessionBenchmark(id: string, update: Partial<SessionBenchmarkRecord> & { clearCompletion?: boolean }): Promise<SessionBenchmarkRecord | undefined> {
    const current = this.benchmarks.get(id)
    if (!current) return undefined
    const updated: SessionBenchmarkRecord = { ...current, ...update, id }
    delete (updated as SessionBenchmarkRecord & { clearCompletion?: boolean }).clearCompletion
    if (update.clearCompletion) {
      delete updated.completedAt
      delete updated.completedElapsedMs
      delete updated.completedByClientId
    }
    this.benchmarks.set(id, updated)
    return structuredClone(updated)
  }

  async createEvolutionRun(input: Omit<EvolutionRunRecord, 'id'>): Promise<EvolutionRunRecord> {
    const run = { id: randomUUID(), ...input }
    this.evolutionRuns.set(run.id, run)
    return structuredClone(run)
  }

  async getEvolutionRun(id: string): Promise<EvolutionRunRecord | undefined> {
    const run = this.evolutionRuns.get(id)
    return run ? structuredClone(run) : undefined
  }

  async listEvolutionRuns(sessionId: string): Promise<EvolutionRunRecord[]> {
    return [...this.evolutionRuns.values()].filter((run) => run.sessionId === sessionId).sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map((run) => structuredClone(run))
  }

  async updateEvolutionRun(id: string, update: Partial<EvolutionRunRecord>): Promise<EvolutionRunRecord | undefined> {
    const current = this.evolutionRuns.get(id)
    if (!current) return undefined
    const updated = { ...current, ...update, id }
    this.evolutionRuns.set(id, updated)
    return structuredClone(updated)
  }

  async addParticipant(participant: ParticipantRecord): Promise<void> {
    const index = this.participants.findIndex((entry) => entry.sessionId === participant.sessionId && entry.clientId === participant.clientId)
    if (index >= 0) this.participants[index] = structuredClone(participant)
    else this.participants.push(structuredClone(participant))
  }

  async listParticipants(sessionId: string): Promise<ParticipantRecord[]> {
    return this.participants.filter((participant) => participant.sessionId === sessionId).map((participant) => structuredClone(participant))
  }

  async appendEvent(event: StoredDomainEvent): Promise<void> {
    this.events.push(structuredClone(event))
  }

  async listEvents(sessionId: string): Promise<StoredDomainEvent[]> {
    return this.events.filter((event) => event.sessionId === sessionId).map((event) => structuredClone(event))
  }

  async loadYDocument(name: string): Promise<Uint8Array | undefined> {
    const state = this.documents.get(name)
    return state ? new Uint8Array(state) : undefined
  }

  async saveYDocument(name: string, state: Uint8Array): Promise<void> {
    this.documents.set(name, new Uint8Array(state))
  }
}
