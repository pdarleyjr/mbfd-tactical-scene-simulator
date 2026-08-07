import { randomUUID } from 'node:crypto'
import type { ScenarioInput } from '@mbfd/domain'
import type { ParticipantRecord, ScenarioAssetRecord, ScenarioRecord, SessionRecord, StoredDomainEvent } from '../model.js'
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

  async createSession(input: Omit<SessionRecord, 'id' | 'code' | 'createdAt' | 'updatedAt'>): Promise<SessionRecord> {
    let code = createRoomCode()
    while ([...this.sessions.values()].some((session) => session.code === code)) code = createRoomCode()
    const now = new Date().toISOString()
    const session: SessionRecord = { ...input, id: randomUUID(), code, createdAt: now, updatedAt: now }
    this.sessions.set(session.id, session)
    return structuredClone(session)
  }

  async listSessions(): Promise<SessionRecord[]> {
    return Promise.all([...this.sessions.values()].map((session) => this.getSession(session.id))).then((items) => items.filter((item): item is SessionRecord => Boolean(item)))
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
