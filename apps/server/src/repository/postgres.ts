import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { apparatusCatalog, evolutionCatalog, type Mode300, type ScenarioInput } from '@mbfd/domain'
import { initialScenario } from '../seed.js'
import type { EvolutionRunRecord, ParticipantRecord, RoomRecord, ScenarioAssetRecord, ScenarioRecord, SessionBenchmarkRecord, SessionRecord, StoredDomainEvent, UnitStatusRecord } from '../model.js'
import * as schema from '../db/schema.js'
import type { TacticalRepository } from './repository.js'

const roomAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function createRoomCode(): string {
  return Array.from({ length: 6 }, () => roomAlphabet[Math.floor(Math.random() * roomAlphabet.length)]).join('')
}

function slugify(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
}

export class PostgresRepository implements TacticalRepository {
  readonly pool: Pool
  readonly db: NodePgDatabase<typeof schema>

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 12, idleTimeoutMillis: 30_000 })
    this.db = drizzle(this.pool, { schema })
  }

  async initialize(): Promise<void> {
    await this.db.insert(schema.apparatusTemplates).values(apparatusCatalog.map((item) => ({
      id: item.id, designation: item.designation, kind: item.kind, assetPath: item.assetPath,
      realLengthFt: item.realLengthFt, realWidthFt: item.realWidthFt,
      configuration: { displayLengthWorld: item.displayLengthWorld, displayWidthWorld: item.displayWidthWorld, calibrationStatus: item.calibrationStatus },
    }))).onConflictDoNothing()
    await this.db.insert(schema.apparatusCapabilities).values(apparatusCatalog.flatMap((item) => item.capabilities.map((capability) => ({ apparatusTemplateId: item.id, capability })))).onConflictDoNothing()
    await this.db.insert(schema.hoseTypes).values([
      { id: 'attack175', insideDiameterIn: 1.75, coupling: 'nh-1.5', configuration: { sectionLengthFt: 100, startCoupling: 'nh-1.5-female', endCoupling: 'nh-1.5-male' } },
      { id: 'hose3', insideDiameterIn: 3, coupling: 'nh-2.5', configuration: { sectionLengthFt: 100, startCoupling: 'nh-2.5-female', endCoupling: 'nh-2.5-male' } },
      { id: 'supply5', insideDiameterIn: 5, coupling: 'storz-5', configuration: { sectionLengthFt: 100, startCoupling: 'storz-5', endCoupling: 'storz-5' } },
    ]).onConflictDoNothing()
    await this.db.insert(schema.nozzleTypes).values([
      { id: 'fog', label: 'Fog Nozzle', coupling: 'nh-1.5-female', configuration: {} },
      { id: 'smooth-bore', label: 'Smooth Bore', coupling: 'nh-1.5-female', configuration: {} },
    ]).onConflictDoNothing()
    await this.db.insert(schema.applianceTypes).values([{ id: 'gated-wye', label: 'Gated Wye', configuration: { inlet: 'nh-2.5-female', outlets: ['nh-1.5-male', 'nh-1.5-male'] } }]).onConflictDoNothing()
    await this.db.insert(schema.evolutionDefinitions).values(evolutionCatalog.map((item) => ({ id: item.id, label: item.label, summary: item.summary, configuration: {} }))).onConflictDoNothing()
    const existing = await this.getScenario(initialScenario.id)
    if (!existing) {
      await this.db.insert(schema.scenarios).values({
        id: initialScenario.id,
        slug: initialScenario.slug,
        title: initialScenario.title,
        description: initialScenario.description,
        dispatchInformation: initialScenario.dispatchInformation,
        worldWidth: initialScenario.worldWidth,
        worldHeight: initialScenario.worldHeight,
        apparatusTemplateIds: initialScenario.apparatusTemplateIds,
        evolutionIds: initialScenario.evolutionIds,
        benchmarks: initialScenario.benchmarks,
        injects: initialScenario.injects,
        staticObjects: initialScenario.staticObjects,
        backgroundAssetId: initialScenario.backgroundAssetId,
        videoAssetId: initialScenario.videoAssetId,
        createdAt: new Date(initialScenario.createdAt),
        updatedAt: new Date(initialScenario.updatedAt),
      })
      await this.db.insert(schema.scenarioAssets).values(initialScenario.assets.map((asset) => ({ ...asset, createdAt: new Date(asset.createdAt) })))
    }
  }

  async close(): Promise<void> { await this.pool.end() }

  private async assetsForScenario(scenarioId: string): Promise<ScenarioAssetRecord[]> {
    const rows = await this.db.select().from(schema.scenarioAssets).where(eq(schema.scenarioAssets.scenarioId, scenarioId))
    return rows.map((row) => ({
      id: row.id,
      scenarioId: row.scenarioId,
      kind: row.kind as ScenarioAssetRecord['kind'],
      originalPath: row.originalPath,
      runtimePath: row.runtimePath,
      ...(row.thumbnailPath ? { thumbnailPath: row.thumbnailPath } : {}),
      ...(row.posterPath ? { posterPath: row.posterPath } : {}),
      mimeType: row.mimeType,
      byteSize: row.byteSize,
      ...(row.width === null ? {} : { width: row.width }),
      ...(row.height === null ? {} : { height: row.height }),
      sha256: row.sha256,
      createdAt: row.createdAt.toISOString(),
    }))
  }

  private async scenarioFromRow(row: typeof schema.scenarios.$inferSelect): Promise<ScenarioRecord> {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      dispatchInformation: row.dispatchInformation,
      worldWidth: row.worldWidth,
      worldHeight: row.worldHeight,
      ...(row.feetPerWorldUnit === null ? {} : { feetPerWorldUnit: row.feetPerWorldUnit }),
      apparatusTemplateIds: row.apparatusTemplateIds,
      evolutionIds: row.evolutionIds,
      benchmarks: row.benchmarks,
      injects: row.injects,
      staticObjects: row.staticObjects,
      ...(row.backgroundAssetId ? { backgroundAssetId: row.backgroundAssetId } : {}),
      ...(row.videoAssetId ? { videoAssetId: row.videoAssetId } : {}),
      archived: row.archived,
      assets: await this.assetsForScenario(row.id),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async listScenarios(): Promise<ScenarioRecord[]> {
    const rows = await this.db.select().from(schema.scenarios).where(eq(schema.scenarios.archived, false)).orderBy(desc(schema.scenarios.updatedAt))
    return Promise.all(rows.map((row) => this.scenarioFromRow(row)))
  }

  async getScenario(id: string): Promise<ScenarioRecord | undefined> {
    const [row] = await this.db.select().from(schema.scenarios).where(eq(schema.scenarios.id, id)).limit(1)
    return row ? this.scenarioFromRow(row) : undefined
  }

  async createScenario(input: ScenarioInput & { id?: string; slug?: string }): Promise<ScenarioRecord> {
    const id = input.id ?? randomUUID()
    const now = new Date()
    await this.db.insert(schema.scenarios).values({
      id,
      slug: input.slug ?? `${slugify(input.title)}-${id.slice(0, 8)}`,
      title: input.title,
      description: input.description,
      dispatchInformation: input.dispatchInformation,
      worldWidth: input.worldWidth,
      worldHeight: input.worldHeight,
      ...(input.feetPerWorldUnit ? { feetPerWorldUnit: input.feetPerWorldUnit } : {}),
      apparatusTemplateIds: input.apparatusTemplateIds,
      evolutionIds: input.evolutionIds,
      benchmarks: input.benchmarks,
      injects: input.injects,
      staticObjects: input.staticObjects,
      archived: false,
      createdAt: now,
      updatedAt: now,
    })
    const created = await this.getScenario(id)
    if (!created) throw new Error('Scenario insert failed')
    return created
  }

  async updateScenario(id: string, input: Partial<ScenarioInput>): Promise<ScenarioRecord | undefined> {
    const values = { ...input, updatedAt: new Date() }
    await this.db.update(schema.scenarios).set(values).where(eq(schema.scenarios.id, id))
    return this.getScenario(id)
  }

  async deleteScenario(id: string): Promise<boolean> {
    const rows = await this.db.update(schema.scenarios).set({ archived: true, updatedAt: new Date() }).where(eq(schema.scenarios.id, id)).returning({ id: schema.scenarios.id })
    return rows.length > 0
  }

  async addScenarioAsset(asset: ScenarioAssetRecord): Promise<void> {
    await this.db.insert(schema.scenarioAssets).values({ ...asset, createdAt: new Date(asset.createdAt) })
    const update = asset.kind === 'background' ? { backgroundAssetId: asset.id } : asset.kind === 'video' ? { videoAssetId: asset.id } : {}
    await this.db.update(schema.scenarios).set({ ...update, updatedAt: new Date() }).where(eq(schema.scenarios.id, asset.scenarioId))
  }

  private roomFromRow(row: typeof schema.trainingRooms.$inferSelect): RoomRecord {
    return { id: row.id, name: row.name, ...(row.accessPinHash ? { accessPinHash: row.accessPinHash } : {}), archived: row.archived, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
  }

  async createRoom(input: { name: string; accessPinHash?: string }): Promise<RoomRecord> {
    const id = randomUUID()
    await this.db.insert(schema.trainingRooms).values({ id, name: input.name, ...(input.accessPinHash ? { accessPinHash: input.accessPinHash } : {}) })
    const created = await this.getRoom(id)
    if (!created) throw new Error('Room insert failed')
    return created
  }

  async listRooms(): Promise<RoomRecord[]> {
    const rows = await this.db.select().from(schema.trainingRooms).orderBy(desc(schema.trainingRooms.updatedAt))
    return rows.map((row) => this.roomFromRow(row))
  }

  async getRoom(id: string): Promise<RoomRecord | undefined> {
    const [row] = await this.db.select().from(schema.trainingRooms).where(eq(schema.trainingRooms.id, id)).limit(1)
    return row ? this.roomFromRow(row) : undefined
  }

  async updateRoom(id: string, update: Partial<Pick<RoomRecord, 'name' | 'accessPinHash' | 'archived'>> & { clearAccessPin?: boolean }): Promise<RoomRecord | undefined> {
    await this.db.update(schema.trainingRooms).set({
      ...(update.name !== undefined ? { name: update.name } : {}),
      ...(update.accessPinHash !== undefined ? { accessPinHash: update.accessPinHash } : {}),
      ...(update.clearAccessPin ? { accessPinHash: null } : {}),
      ...(update.archived !== undefined ? { archived: update.archived } : {}),
      updatedAt: new Date(),
    }).where(eq(schema.trainingRooms.id, id))
    return this.getRoom(id)
  }

  private sessionFromRow(row: typeof schema.trainingSessions.$inferSelect): SessionRecord {
    return {
      id: row.id,
      code: row.code,
      roomId: row.roomId,
      scenarioId: row.scenarioId,
      participatingUnits: row.participatingUnits,
      mode300: row.mode300 as Mode300,
      status: row.status as SessionRecord['status'],
      ...(row.startedAt ? { startedAt: row.startedAt.toISOString() } : {}),
      accumulatedElapsedMs: row.accumulatedElapsedMs,
      ...(row.timerAnchorAt ? { timerAnchorAt: row.timerAnchorAt.toISOString() } : {}),
      ...(row.frozen300Plan ? { frozen300Plan: new Uint8Array(row.frozen300Plan) } : {}),
      presentationMode: row.presentationMode as SessionRecord['presentationMode'],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }

  async createSession(input: Omit<SessionRecord, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'accumulatedElapsedMs'> & { accumulatedElapsedMs?: number }): Promise<SessionRecord> {
    let code = createRoomCode()
    while (await this.getSessionByCode(code)) code = createRoomCode()
    const id = randomUUID()
    await this.db.insert(schema.trainingSessions).values({
      id, code, roomId: input.roomId, scenarioId: input.scenarioId, participatingUnits: input.participatingUnits,
      mode300: input.mode300, status: input.status, presentationMode: input.presentationMode,
      ...(input.startedAt ? { startedAt: new Date(input.startedAt) } : {}),
      accumulatedElapsedMs: input.accumulatedElapsedMs ?? 0,
      ...(input.timerAnchorAt ? { timerAnchorAt: new Date(input.timerAnchorAt) } : {}),
      ...(input.frozen300Plan ? { frozen300Plan: Buffer.from(input.frozen300Plan) } : {}),
    })
    const created = await this.getSession(id)
    if (!created) throw new Error('Session insert failed')
    return created
  }

  async listSessions(): Promise<SessionRecord[]> {
    const rows = await this.db.select().from(schema.trainingSessions).orderBy(desc(schema.trainingSessions.createdAt))
    return rows.map((row) => this.sessionFromRow(row))
  }

  async getSession(id: string): Promise<SessionRecord | undefined> {
    const [row] = await this.db.select().from(schema.trainingSessions).where(eq(schema.trainingSessions.id, id)).limit(1)
    return row ? this.sessionFromRow(row) : undefined
  }

  async getSessionByCode(code: string): Promise<SessionRecord | undefined> {
    const [row] = await this.db.select().from(schema.trainingSessions).where(eq(schema.trainingSessions.code, code.toUpperCase())).limit(1)
    return row ? this.sessionFromRow(row) : undefined
  }

  async updateSession(id: string, update: Partial<SessionRecord> & { clearTimerAnchor?: boolean }): Promise<SessionRecord | undefined> {
    await this.db.update(schema.trainingSessions).set({
      ...(update.roomId ? { roomId: update.roomId } : {}),
      ...(update.scenarioId ? { scenarioId: update.scenarioId } : {}),
      ...(update.participatingUnits ? { participatingUnits: update.participatingUnits } : {}),
      ...(update.mode300 ? { mode300: update.mode300 } : {}),
      ...(update.status ? { status: update.status } : {}),
      ...(update.startedAt ? { startedAt: new Date(update.startedAt) } : {}),
      ...(update.accumulatedElapsedMs !== undefined ? { accumulatedElapsedMs: update.accumulatedElapsedMs } : {}),
      ...(update.timerAnchorAt ? { timerAnchorAt: new Date(update.timerAnchorAt) } : {}),
      ...(update.clearTimerAnchor ? { timerAnchorAt: null } : {}),
      ...(update.frozen300Plan ? { frozen300Plan: Buffer.from(update.frozen300Plan) } : {}),
      ...(update.presentationMode ? { presentationMode: update.presentationMode } : {}),
      updatedAt: new Date(),
    }).where(eq(schema.trainingSessions.id, id))
    return this.getSession(id)
  }

  private unitFromRow(row: typeof schema.sessionUnits.$inferSelect): UnitStatusRecord {
    return { sessionId: row.sessionId, unit: row.unit, status: row.status as UnitStatusRecord['status'], ...(row.arrivedAt ? { arrivedAt: row.arrivedAt.toISOString() } : {}), ...(row.arrivedByClientId ? { arrivedByClientId: row.arrivedByClientId } : {}) }
  }

  async replaceSessionUnits(sessionId: string, units: string[]): Promise<UnitStatusRecord[]> {
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.sessionUnits).where(eq(schema.sessionUnits.sessionId, sessionId))
      if (units.length) await tx.insert(schema.sessionUnits).values(units.map((unit) => ({ sessionId, unit })))
    })
    return this.listUnitStatuses(sessionId)
  }

  async listUnitStatuses(sessionId: string): Promise<UnitStatusRecord[]> {
    const rows = await this.db.select().from(schema.sessionUnits).where(eq(schema.sessionUnits.sessionId, sessionId)).orderBy(asc(schema.sessionUnits.unit))
    return rows.map((row) => this.unitFromRow(row))
  }

  async getUnitStatus(sessionId: string, unit: string): Promise<UnitStatusRecord | undefined> {
    const [row] = await this.db.select().from(schema.sessionUnits).where(and(eq(schema.sessionUnits.sessionId, sessionId), eq(schema.sessionUnits.unit, unit))).limit(1)
    return row ? this.unitFromRow(row) : undefined
  }

  async updateUnitStatus(sessionId: string, unit: string, update: Partial<UnitStatusRecord> & { clearArrival?: boolean }): Promise<UnitStatusRecord | undefined> {
    await this.db.update(schema.sessionUnits).set({
      ...(update.status ? { status: update.status } : {}),
      ...(update.arrivedAt ? { arrivedAt: new Date(update.arrivedAt) } : {}),
      ...(update.arrivedByClientId ? { arrivedByClientId: update.arrivedByClientId } : {}),
      ...(update.clearArrival ? { arrivedAt: null, arrivedByClientId: null } : {}),
    }).where(and(eq(schema.sessionUnits.sessionId, sessionId), eq(schema.sessionUnits.unit, unit)))
    return this.getUnitStatus(sessionId, unit)
  }

  private benchmarkFromRow(row: typeof schema.sessionBenchmarks.$inferSelect): SessionBenchmarkRecord {
    return { id: row.id, sessionId: row.sessionId, sourceBenchmarkId: row.sourceBenchmarkId, label: row.label, description: row.description, ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}), ...(row.completedElapsedMs === null ? {} : { completedElapsedMs: row.completedElapsedMs }), ...(row.completedByClientId ? { completedByClientId: row.completedByClientId } : {}), createdAt: row.createdAt.toISOString() }
  }

  async replaceSessionBenchmarks(sessionId: string, items: Array<{ sourceBenchmarkId: string; label: string; description: string }>): Promise<SessionBenchmarkRecord[]> {
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.sessionBenchmarks).where(eq(schema.sessionBenchmarks.sessionId, sessionId))
      if (items.length) await tx.insert(schema.sessionBenchmarks).values(items.map((item) => ({ id: randomUUID(), sessionId, ...item })))
    })
    return this.listSessionBenchmarks(sessionId)
  }

  async listSessionBenchmarks(sessionId: string): Promise<SessionBenchmarkRecord[]> {
    const rows = await this.db.select().from(schema.sessionBenchmarks).where(eq(schema.sessionBenchmarks.sessionId, sessionId)).orderBy(asc(schema.sessionBenchmarks.createdAt))
    return rows.map((row) => this.benchmarkFromRow(row))
  }

  async getSessionBenchmark(id: string): Promise<SessionBenchmarkRecord | undefined> {
    const [row] = await this.db.select().from(schema.sessionBenchmarks).where(eq(schema.sessionBenchmarks.id, id)).limit(1)
    return row ? this.benchmarkFromRow(row) : undefined
  }

  async updateSessionBenchmark(id: string, update: Partial<SessionBenchmarkRecord> & { clearCompletion?: boolean }): Promise<SessionBenchmarkRecord | undefined> {
    await this.db.update(schema.sessionBenchmarks).set({
      ...(update.completedAt ? { completedAt: new Date(update.completedAt) } : {}),
      ...(update.completedElapsedMs !== undefined ? { completedElapsedMs: update.completedElapsedMs } : {}),
      ...(update.completedByClientId ? { completedByClientId: update.completedByClientId } : {}),
      ...(update.clearCompletion ? { completedAt: null, completedElapsedMs: null, completedByClientId: null } : {}),
    }).where(eq(schema.sessionBenchmarks.id, id))
    return this.getSessionBenchmark(id)
  }

  private evolutionFromRow(row: typeof schema.evolutionRuns.$inferSelect): EvolutionRunRecord {
    return { id: row.id, sessionId: row.sessionId, unit: row.unit, evolutionId: row.evolutionId, label: row.label, status: row.status as EvolutionRunRecord['status'], startedAt: row.startedAt.toISOString(), startedElapsedMs: row.startedElapsedMs, startedByClientId: row.startedByClientId, startedByName: row.startedByName, ...(row.completedAt ? { completedAt: row.completedAt.toISOString() } : {}), ...(row.completedElapsedMs === null ? {} : { completedElapsedMs: row.completedElapsedMs }), ...(row.completedByClientId ? { completedByClientId: row.completedByClientId } : {}) }
  }

  async createEvolutionRun(input: Omit<EvolutionRunRecord, 'id'>): Promise<EvolutionRunRecord> {
    const id = randomUUID()
    await this.db.insert(schema.evolutionRuns).values({ id, sessionId: input.sessionId, unit: input.unit, evolutionId: input.evolutionId, label: input.label, status: input.status, startedAt: new Date(input.startedAt), startedElapsedMs: input.startedElapsedMs, startedByClientId: input.startedByClientId, startedByName: input.startedByName })
    const created = await this.getEvolutionRun(id)
    if (!created) throw new Error('Evolution insert failed')
    return created
  }

  async getEvolutionRun(id: string): Promise<EvolutionRunRecord | undefined> {
    const [row] = await this.db.select().from(schema.evolutionRuns).where(eq(schema.evolutionRuns.id, id)).limit(1)
    return row ? this.evolutionFromRow(row) : undefined
  }

  async listEvolutionRuns(sessionId: string): Promise<EvolutionRunRecord[]> {
    const rows = await this.db.select().from(schema.evolutionRuns).where(eq(schema.evolutionRuns.sessionId, sessionId)).orderBy(asc(schema.evolutionRuns.startedAt))
    return rows.map((row) => this.evolutionFromRow(row))
  }

  async updateEvolutionRun(id: string, update: Partial<EvolutionRunRecord>): Promise<EvolutionRunRecord | undefined> {
    await this.db.update(schema.evolutionRuns).set({
      ...(update.status ? { status: update.status } : {}),
      ...(update.completedAt ? { completedAt: new Date(update.completedAt) } : {}),
      ...(update.completedElapsedMs !== undefined ? { completedElapsedMs: update.completedElapsedMs } : {}),
      ...(update.completedByClientId ? { completedByClientId: update.completedByClientId } : {}),
    }).where(eq(schema.evolutionRuns.id, id))
    return this.getEvolutionRun(id)
  }

  async addParticipant(participant: ParticipantRecord): Promise<void> {
    await this.db.insert(schema.sessionParticipants).values({
      ...participant,
      joinedAt: new Date(participant.joinedAt),
      lastSeenAt: new Date(participant.lastSeenAt),
    }).onConflictDoUpdate({
      target: [schema.sessionParticipants.sessionId, schema.sessionParticipants.clientId],
      set: { name: participant.name, unit: participant.unit, role: participant.role, lastSeenAt: new Date(participant.lastSeenAt) },
    })
  }

  async listParticipants(sessionId: string): Promise<ParticipantRecord[]> {
    const rows = await this.db.select().from(schema.sessionParticipants).where(eq(schema.sessionParticipants.sessionId, sessionId))
    return rows.map((row) => ({ ...row, role: row.role as ParticipantRecord['role'], joinedAt: row.joinedAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString() }))
  }

  async appendEvent(event: StoredDomainEvent): Promise<void> {
    await this.db.insert(schema.sessionEvents).values({ ...event, occurredAt: new Date(event.occurredAt) })
  }

  async listEvents(sessionId: string): Promise<StoredDomainEvent[]> {
    const rows = await this.db.select().from(schema.sessionEvents).where(eq(schema.sessionEvents.sessionId, sessionId))
    return rows.map((row) => ({
      id: row.id, sessionId: row.sessionId, workspace: row.workspace as StoredDomainEvent['workspace'], elapsedMs: row.elapsedMs,
      occurredAt: row.occurredAt.toISOString(), actorClientId: row.actorClientId, actorName: row.actorName, actorUnit: row.actorUnit,
      eventType: row.eventType, ...(row.objectId ? { objectId: row.objectId } : {}), metadata: row.metadata,
    }))
  }

  async loadYDocument(name: string): Promise<Uint8Array | undefined> {
    const [row] = await this.db.select().from(schema.yjsDocuments).where(eq(schema.yjsDocuments.name, name)).limit(1)
    return row ? new Uint8Array(row.state) : undefined
  }

  async saveYDocument(name: string, state: Uint8Array): Promise<void> {
    await this.db.insert(schema.yjsDocuments).values({ name, state: Buffer.from(state), updatedAt: new Date() }).onConflictDoUpdate({
      target: schema.yjsDocuments.name,
      set: { state: Buffer.from(state), updatedAt: new Date() },
    })
  }
}
