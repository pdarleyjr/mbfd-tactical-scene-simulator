import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import fastifyMultipart from '@fastify/multipart'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import {
  configureSessionInputSchema,
  createRoomInputSchema,
  createSessionInputSchema,
  domainEventSchema,
  evolutionCatalog,
  joinSessionInputSchema,
  scenarioInputSchema,
  updateRoomInputSchema,
  type ParticipantRole,
} from '@mbfd/domain'
import { defaultPermissions, documentName } from '@mbfd/collaboration'
import { processScenarioImage, processScenarioVideo } from './assets.js'
import type { TacticalRepository } from './repository/repository.js'
import {
  constantTimePinMatches,
  signControllerToken,
  signSessionToken,
  verifyControllerToken,
  verifySessionToken,
} from './security/tokens.js'
import { hashRoomPin, roomPinMatches } from './security/room-pins.js'

export interface AppOptions {
  repository: TacticalRepository
  signingSecret: string
  instructorPin: string
  assetStoragePath: string
  publicBaseUrl: string
  enableRateLimit?: boolean
  release?: string
}

function bearerToken(request: FastifyRequest): string {
  const header = request.headers.authorization
  if (!header?.startsWith('Bearer ')) throw new Error('Bearer token required')
  return header.slice(7)
}

function scenarioResponse<T extends { assets: Array<{ runtimePath: string; thumbnailPath?: string; posterPath?: string }> }>(scenario: T) {
  return {
    ...scenario,
    assets: scenario.assets.map((asset) => ({
      ...asset,
      runtimeUrl: `/scenario-assets/${asset.runtimePath}`,
      ...(asset.thumbnailPath ? { thumbnailUrl: `/scenario-assets/${asset.thumbnailPath}` } : {}),
      ...(asset.posterPath ? { posterUrl: `/scenario-assets/${asset.posterPath}` } : {}),
    })),
  }
}

function elapsedMs(session: { startedAt?: string; createdAt: string }): number {
  return Math.max(0, Date.now() - new Date(session.startedAt ?? session.createdAt).getTime())
}

function sessionResponse<T extends { code: string }>(session: T): Omit<T, 'code'> {
  const { code: _legacyCode, ...response } = session
  return response
}

export async function createApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, bodyLimit: 2 * 1024 * 1024, trustProxy: true })
  await options.repository.initialize()

  if (options.enableRateLimit !== false) {
    await app.register(fastifyRateLimit, { max: 120, timeWindow: '1 minute' })
  }
  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: 200 * 1024 * 1024, fields: 8 },
  })
  if (existsSync(options.assetStoragePath)) {
    await app.register(fastifyStatic, {
      root: path.resolve(options.assetStoragePath),
      prefix: '/scenario-assets/',
      decorateReply: false,
      immutable: false,
      maxAge: '1h',
    })
  }

  app.addHook('onClose', async () => options.repository.close())
  app.setErrorHandler((error, _request, reply) => {
    const statusCode = error && typeof error === 'object' && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 400
    const message = error instanceof Error ? error.message : 'Request could not be processed.'
    void reply.code(statusCode).send({ error: statusCode >= 500 ? 'Internal server error' : message })
  })

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'mbfd-tactical-scene-simulator',
    release: options.release ?? 'development',
    node: process.version,
    timestamp: new Date().toISOString(),
  }))

  app.post('/api/instructor/session', async (request, reply) => {
    const body = request.body as { pin?: unknown }
    const pin = typeof body?.pin === 'string' ? body.pin : ''
    if (!constantTimePinMatches(pin, options.instructorPin)) return reply.code(401).send({ error: 'Instructor PIN was not accepted.' })
    return { token: signControllerToken(options.signingSecret), expiresInSeconds: 28_800 }
  })

  app.get('/api/scenarios', async () => {
    const items = await options.repository.listScenarios()
    return { items: items.map(scenarioResponse) }
  })

  app.get<{ Params: { id: string } }>('/api/scenarios/:id', async (request, reply) => {
    const scenario = await options.repository.getScenario(request.params.id)
    if (!scenario) return reply.code(404).send({ error: 'Scenario not found.' })
    return scenarioResponse(scenario)
  })

  app.post('/api/scenarios', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const input = scenarioInputSchema.parse(request.body)
    const scenario = await options.repository.createScenario(input)
    return reply.code(201).send(scenarioResponse(scenario))
  })

  app.patch<{ Params: { id: string } }>('/api/scenarios/:id', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const parsed = scenarioInputSchema.partial().parse(request.body)
    const input = Object.fromEntries(Object.entries(parsed).filter((entry) => entry[1] !== undefined))
    const scenario = await options.repository.updateScenario(request.params.id, input)
    if (!scenario) return reply.code(404).send({ error: 'Scenario not found.' })
    return scenarioResponse(scenario)
  })

  app.delete<{ Params: { id: string } }>('/api/scenarios/:id', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const deleted = await options.repository.deleteScenario(request.params.id)
    return deleted ? reply.code(204).send() : reply.code(404).send({ error: 'Scenario not found.' })
  })

  app.post<{ Params: { id: string } }>('/api/scenarios/:id/duplicate', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const source = await options.repository.getScenario(request.params.id)
    if (!source) return reply.code(404).send({ error: 'Scenario not found.' })
    const duplicate = await options.repository.createScenario({
      title: `${source.title} Copy`,
      description: source.description,
      dispatchInformation: source.dispatchInformation,
      worldWidth: source.worldWidth,
      worldHeight: source.worldHeight,
      ...(source.feetPerWorldUnit ? { feetPerWorldUnit: source.feetPerWorldUnit } : {}),
      apparatusTemplateIds: [...source.apparatusTemplateIds],
      evolutionIds: [...source.evolutionIds],
      benchmarks: structuredClone(source.benchmarks),
      injects: structuredClone(source.injects),
      staticObjects: structuredClone(source.staticObjects),
    })
    return reply.code(201).send(scenarioResponse(duplicate))
  })

  app.post<{ Params: { id: string } }>('/api/scenarios/:id/assets/background', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const scenario = await options.repository.getScenario(request.params.id)
    if (!scenario) return reply.code(404).send({ error: 'Scenario not found.' })
    const file = await request.file()
    if (!file) return reply.code(400).send({ error: 'Image file required.' })
    const asset = await processScenarioImage(file, scenario.id, options.assetStoragePath)
    await options.repository.addScenarioAsset(asset)
    await options.repository.updateScenario(scenario.id, { worldWidth: asset.width ?? scenario.worldWidth, worldHeight: asset.height ?? scenario.worldHeight })
    return reply.code(201).send({ ...asset, runtimeUrl: `/scenario-assets/${asset.runtimePath}`, thumbnailUrl: `/scenario-assets/${asset.thumbnailPath}` })
  })

  app.post<{ Params: { id: string } }>('/api/scenarios/:id/assets/video', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const scenario = await options.repository.getScenario(request.params.id)
    if (!scenario) return reply.code(404).send({ error: 'Scenario not found.' })
    const file = await request.file()
    if (!file) return reply.code(400).send({ error: 'MP4 video file required.' })
    const asset = await processScenarioVideo(file, scenario.id, options.assetStoragePath)
    await options.repository.addScenarioAsset(asset)
    return reply.code(201).send({ ...asset, runtimeUrl: `/scenario-assets/${asset.runtimePath}`, posterUrl: `/scenario-assets/${asset.posterPath}` })
  })

  async function publicRoomResponse(room: Awaited<ReturnType<TacticalRepository['getRoom']>>) {
    if (!room) return undefined
    const sessions = (await options.repository.listSessions()).filter((session) => session.roomId === room.id && session.status !== 'complete')
    const currentSession = sessions[0]
    const scenario = currentSession ? await options.repository.getScenario(currentSession.scenarioId) : undefined
    return {
      id: room.id,
      name: room.name,
      locked: Boolean(room.accessPinHash),
      updatedAt: room.updatedAt,
      ...(currentSession ? { currentSession: { id: currentSession.id, status: currentSession.status, participatingUnits: currentSession.participatingUnits, scenarioTitle: scenario?.title ?? 'Training scenario' } } : {}),
    }
  }

  app.get('/api/rooms', async () => {
    const rooms = (await options.repository.listRooms()).filter((room) => !room.archived)
    return { items: (await Promise.all(rooms.map(publicRoomResponse))).filter(Boolean) }
  })

  app.get<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    const room = await options.repository.getRoom(request.params.id)
    if (!room || room.archived) return reply.code(404).send({ error: 'Training room not found.' })
    return publicRoomResponse(room)
  })

  app.post('/api/rooms', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const input = createRoomInputSchema.parse(request.body)
    const room = await options.repository.createRoom({ name: input.name, ...(input.accessPin ? { accessPinHash: hashRoomPin(input.accessPin) } : {}) })
    return reply.code(201).send({ id: room.id, name: room.name, locked: Boolean(room.accessPinHash), updatedAt: room.updatedAt })
  })

  app.patch<{ Params: { id: string } }>('/api/rooms/:id', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const input = updateRoomInputSchema.parse(request.body)
    const room = await options.repository.updateRoom(request.params.id, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(typeof input.accessPin === 'string' ? { accessPinHash: hashRoomPin(input.accessPin) } : {}),
      ...(input.accessPin === null ? { clearAccessPin: true } : {}),
      ...(input.archived !== undefined ? { archived: input.archived } : {}),
    })
    if (!room) return reply.code(404).send({ error: 'Training room not found.' })
    return { id: room.id, name: room.name, locked: Boolean(room.accessPinHash), updatedAt: room.updatedAt }
  })

  app.post('/api/sessions', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const input = createSessionInputSchema.parse(request.body)
    const room = await options.repository.getRoom(input.roomId)
    if (!room || room.archived) return reply.code(404).send({ error: 'Training room not found.' })
    const scenario = await options.repository.getScenario(input.scenarioId)
    if (!scenario) return reply.code(404).send({ error: 'Scenario not found.' })
    const session = await options.repository.createSession({
      roomId: input.roomId,
      scenarioId: input.scenarioId,
      participatingUnits: input.participatingUnits,
      mode300: input.mode300,
      status: 'setup',
      presentationMode: 'operations',
    })
    await options.repository.replaceSessionUnits(session.id, input.participatingUnits)
    const selected = scenario.benchmarks.filter((benchmark) => input.benchmarkIds.includes(benchmark.id))
    const benchmarks = await options.repository.replaceSessionBenchmarks(session.id, selected.map((benchmark) => ({ sourceBenchmarkId: benchmark.id, label: benchmark.label, description: benchmark.description })))
    return reply.code(201).send({ ...sessionResponse(session), benchmarks })
  })

  app.put<{ Params: { id: string } }>('/api/sessions/:id/configuration', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const input = configureSessionInputSchema.parse(request.body)
    const session = await options.repository.getSession(request.params.id)
    if (!session) return reply.code(404).send({ error: 'Session not found.' })
    if (session.status !== 'setup') return reply.code(409).send({ error: 'Only a room in setup can be reconfigured.' })
    const scenario = await options.repository.getScenario(input.scenarioId)
    if (!scenario) return reply.code(404).send({ error: 'Scenario not found.' })
    const updated = await options.repository.updateSession(session.id, { scenarioId: input.scenarioId, participatingUnits: input.participatingUnits, mode300: input.mode300 })
    await options.repository.replaceSessionUnits(session.id, input.participatingUnits)
    const selected = scenario.benchmarks.filter((benchmark) => input.benchmarkIds.includes(benchmark.id))
    const benchmarks = await options.repository.replaceSessionBenchmarks(session.id, selected.map((benchmark) => ({ sourceBenchmarkId: benchmark.id, label: benchmark.label, description: benchmark.description })))
    return { ...(updated ? sessionResponse(updated) : {}), benchmarks }
  })

  app.get('/api/sessions', async (request) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    return { items: (await options.repository.listSessions()).map(sessionResponse) }
  })

  app.patch<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    const controller = verifyControllerToken(bearerToken(request), options.signingSecret)
    const body = request.body as { status?: unknown; presentationMode?: unknown }
    const status = typeof body.status === 'string' && ['setup', 'running', 'frozen', 'complete'].includes(body.status) ? body.status as 'setup' | 'running' | 'frozen' | 'complete' : undefined
    const presentationMode = typeof body.presentationMode === 'string' && ['operations', '300-plan', 'split', 'overlay'].includes(body.presentationMode) ? body.presentationMode as 'operations' | '300-plan' | 'split' | 'overlay' : undefined
    if (!status && !presentationMode) return reply.code(400).send({ error: 'A valid status or presentation mode is required.' })
    const existing = await options.repository.getSession(request.params.id)
    if (!existing) return reply.code(404).send({ error: 'Session not found.' })
    const updated = await options.repository.updateSession(existing.id, {
      ...(status ? { status } : {}),
      ...(status === 'running' && !existing.startedAt ? { startedAt: new Date().toISOString() } : {}),
      ...(presentationMode ? { presentationMode } : {}),
    })
    if (status && status !== existing.status) {
      const now = new Date().toISOString()
      await options.repository.appendEvent(domainEventSchema.parse({ id: randomUUID(), sessionId: existing.id, workspace: 'operations', elapsedMs: elapsedMs(updated ?? existing), occurredAt: now, actorClientId: controller.clientId, actorName: 'Instructor', actorUnit: 'INSTRUCTOR', eventType: `session-${status}`, metadata: {} }))
    }
    return updated ? sessionResponse(updated) : updated
  })

  app.post('/api/sessions/join', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = joinSessionInputSchema.parse(request.body)
    const session = await options.repository.getSession(input.sessionId)
    if (!session) return reply.code(404).send({ error: 'Training session not found.' })
    const room = await options.repository.getRoom(session.roomId)
    if (!room || room.archived) return reply.code(404).send({ error: 'Training room not found.' })
    if (room.accessPinHash && (!input.roomPin || !roomPinMatches(input.roomPin, room.accessPinHash))) return reply.code(403).send({ error: 'Room PIN was not accepted.' })
    if (!session.participatingUnits.includes(input.unit)) return reply.code(403).send({ error: 'That unit is not enabled for this session.' })
    if (input.role === 'command300' && input.unit !== '300') return reply.code(400).send({ error: 'The 300 role must use unit 300.' })
    const clientId = input.clientId ?? randomUUID()
    const now = new Date().toISOString()
    await options.repository.addParticipant({ id: randomUUID(), sessionId: session.id, clientId, name: input.name, unit: input.unit, role: input.role, joinedAt: now, lastSeenAt: now })
    const token = signSessionToken({
      sessionId: session.id,
      clientId,
      name: input.name,
      unit: input.unit,
      role: input.role,
      mode300: session.mode300,
      permissions: defaultPermissions(input.role),
    }, options.signingSecret)
    return { token, session: sessionResponse(session), room: { id: room.id, name: room.name, locked: Boolean(room.accessPinHash) }, clientId }
  })

  app.get<{ Params: { id: string } }>('/api/sessions/:id/bootstrap', async (request, reply) => {
    const token = bearerToken(request)
    let role: ParticipantRole = 'instructor'
    try {
      const claims = verifySessionToken(token, options.signingSecret)
      if (claims.sessionId !== request.params.id) return reply.code(403).send({ error: 'Session token does not match this session.' })
      role = claims.role
    } catch {
      verifyControllerToken(token, options.signingSecret)
    }
    const session = await options.repository.getSession(request.params.id)
    if (!session) return reply.code(404).send({ error: 'Session not found.' })
    const scenario = await options.repository.getScenario(session.scenarioId)
    const participants = await options.repository.listParticipants(session.id)
    const room = await options.repository.getRoom(session.roomId)
    const [units, evolutions, benchmarks] = await Promise.all([
      options.repository.listUnitStatuses(session.id),
      options.repository.listEvolutionRuns(session.id),
      options.repository.listSessionBenchmarks(session.id),
    ])
    return { session: sessionResponse(session), room: room ? { id: room.id, name: room.name, locked: Boolean(room.accessPinHash) } : undefined, scenario: scenario ? scenarioResponse(scenario) : undefined, participants, units, evolutions, benchmarks, role }
  })

  app.post<{ Params: { id: string } }>('/api/sessions/:id/presentation-token', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const session = await options.repository.getSession(request.params.id)
    if (!session) return reply.code(404).send({ error: 'Session not found.' })
    return {
      token: signSessionToken({ sessionId: session.id, clientId: randomUUID(), name: 'Classroom Display', unit: 'DISPLAY', role: 'presentation', mode300: session.mode300, permissions: defaultPermissions('presentation') }, options.signingSecret, 24 * 60 * 60),
    }
  })

  app.post<{ Params: { id: string } }>('/api/sessions/:id/300/join-operations', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const session = await options.repository.getSession(request.params.id)
    if (!session) return reply.code(404).send({ error: 'Session not found.' })
    const currentPlan = await options.repository.loadYDocument(documentName(session.id, '300-plan'))
    const updated = await options.repository.updateSession(session.id, {
      mode300: 'hybrid',
      ...(currentPlan ? { frozen300Plan: currentPlan } : {}),
    })
    return { session: updated ? sessionResponse(updated) : updated, planPreserved: Boolean(currentPlan) }
  })

  app.patch<{ Params: { id: string; unit: string } }>('/api/sessions/:id/units/:unit', async (request, reply) => {
    const controller = verifyControllerToken(bearerToken(request), options.signingSecret)
    const body = request.body as { status?: unknown }
    if (body.status !== 'staged' && body.status !== 'arrived') return reply.code(400).send({ error: 'Unit status must be staged or arrived.' })
    const session = await options.repository.getSession(request.params.id)
    if (!session) return reply.code(404).send({ error: 'Session not found.' })
    const current = await options.repository.getUnitStatus(session.id, request.params.unit)
    if (!current) return reply.code(404).send({ error: 'Unit is not assigned to this session.' })
    const now = new Date().toISOString()
    const updated = await options.repository.updateUnitStatus(session.id, current.unit, body.status === 'arrived'
      ? { status: 'arrived', arrivedAt: now, arrivedByClientId: controller.clientId }
      : { status: 'staged', clearArrival: true })
    await options.repository.appendEvent(domainEventSchema.parse({ id: randomUUID(), sessionId: session.id, workspace: 'operations', elapsedMs: elapsedMs(session), occurredAt: now, actorClientId: controller.clientId, actorName: 'Instructor', actorUnit: 'INSTRUCTOR', eventType: body.status === 'arrived' ? 'unit-arrived' : 'unit-staged', metadata: { unit: current.unit } }))
    return updated
  })

  app.post<{ Params: { id: string } }>('/api/sessions/:id/evolutions', async (request, reply) => {
    const claims = verifySessionToken(bearerToken(request), options.signingSecret)
    if (claims.sessionId !== request.params.id) return reply.code(403).send({ error: 'Session token does not match this session.' })
    const session = await options.repository.getSession(request.params.id)
    if (!session) return reply.code(404).send({ error: 'Session not found.' })
    if (session.status !== 'running') return reply.code(409).send({ error: 'The instructor has not started this scenario.' })
    const unit = await options.repository.getUnitStatus(session.id, claims.unit)
    if (!unit || unit.status !== 'arrived') return reply.code(409).send({ error: 'Scenario will load once the instructor marks your unit arrived.' })
    const body = request.body as { evolutionId?: unknown }
    const evolution = evolutionCatalog.find((item) => item.id === body.evolutionId)
    const scenario = await options.repository.getScenario(session.scenarioId)
    if (!evolution || !scenario?.evolutionIds.includes(evolution.id)) return reply.code(400).send({ error: 'That evolution is not enabled for this scenario.' })
    const active = (await options.repository.listEvolutionRuns(session.id)).find((run) => run.unit === claims.unit && run.status === 'active')
    if (active) return reply.code(409).send({ error: `${claims.unit} already has an active evolution.` })
    const now = new Date().toISOString()
    const run = await options.repository.createEvolutionRun({ sessionId: session.id, unit: claims.unit, evolutionId: evolution.id, label: evolution.label, status: 'active', startedAt: now, startedElapsedMs: elapsedMs(session), startedByClientId: claims.clientId, startedByName: claims.name })
    await options.repository.appendEvent(domainEventSchema.parse({ id: randomUUID(), sessionId: session.id, workspace: 'operations', elapsedMs: run.startedElapsedMs, occurredAt: now, actorClientId: claims.clientId, actorName: claims.name, actorUnit: claims.unit, eventType: 'evolution-started', objectId: run.id, metadata: { evolutionId: run.evolutionId, label: run.label } }))
    return reply.code(201).send(run)
  })

  app.patch<{ Params: { id: string; runId: string } }>('/api/sessions/:id/evolutions/:runId', async (request, reply) => {
    const claims = verifySessionToken(bearerToken(request), options.signingSecret)
    if (claims.sessionId !== request.params.id) return reply.code(403).send({ error: 'Session token does not match this session.' })
    const body = request.body as { status?: unknown }
    if (body.status !== 'complete') return reply.code(400).send({ error: 'Evolution status must be complete.' })
    const [session, run] = await Promise.all([options.repository.getSession(request.params.id), options.repository.getEvolutionRun(request.params.runId)])
    if (!session || !run || run.sessionId !== session.id) return reply.code(404).send({ error: 'Evolution run not found.' })
    if (run.unit !== claims.unit) return reply.code(403).send({ error: 'Only the assigned unit can complete this evolution.' })
    if (run.status === 'complete') return run
    const now = new Date().toISOString()
    const completed = await options.repository.updateEvolutionRun(run.id, { status: 'complete', completedAt: now, completedElapsedMs: elapsedMs(session), completedByClientId: claims.clientId })
    await options.repository.appendEvent(domainEventSchema.parse({ id: randomUUID(), sessionId: session.id, workspace: 'operations', elapsedMs: completed?.completedElapsedMs ?? elapsedMs(session), occurredAt: now, actorClientId: claims.clientId, actorName: claims.name, actorUnit: claims.unit, eventType: 'evolution-completed', objectId: run.id, metadata: { evolutionId: run.evolutionId, label: run.label } }))
    return completed
  })

  app.patch<{ Params: { id: string; benchmarkId: string } }>('/api/sessions/:id/benchmarks/:benchmarkId', async (request, reply) => {
    const controller = verifyControllerToken(bearerToken(request), options.signingSecret)
    const body = request.body as { completed?: unknown }
    if (typeof body.completed !== 'boolean') return reply.code(400).send({ error: 'Completed must be true or false.' })
    const [session, benchmark] = await Promise.all([options.repository.getSession(request.params.id), options.repository.getSessionBenchmark(request.params.benchmarkId)])
    if (!session || !benchmark || benchmark.sessionId !== session.id) return reply.code(404).send({ error: 'Benchmark not found.' })
    const now = new Date().toISOString()
    const updated = await options.repository.updateSessionBenchmark(benchmark.id, body.completed
      ? { completedAt: now, completedElapsedMs: elapsedMs(session), completedByClientId: controller.clientId }
      : { clearCompletion: true })
    await options.repository.appendEvent(domainEventSchema.parse({ id: randomUUID(), sessionId: session.id, workspace: 'operations', elapsedMs: elapsedMs(session), occurredAt: now, actorClientId: controller.clientId, actorName: 'Instructor', actorUnit: 'INSTRUCTOR', eventType: body.completed ? 'benchmark-completed' : 'benchmark-reopened', objectId: benchmark.id, metadata: { label: benchmark.label } }))
    return updated
  })

  app.get<{ Params: { id: string } }>('/api/sessions/:id/activity', async (request, reply) => {
    const token = bearerToken(request)
    try {
      const claims = verifySessionToken(token, options.signingSecret)
      if (claims.sessionId !== request.params.id) return reply.code(403).send({ error: 'Session token does not match this session.' })
    } catch {
      verifyControllerToken(token, options.signingSecret)
    }
    const session = await options.repository.getSession(request.params.id)
    if (!session) return reply.code(404).send({ error: 'Session not found.' })
    const [units, evolutions, benchmarks, events] = await Promise.all([
      options.repository.listUnitStatuses(session.id),
      options.repository.listEvolutionRuns(session.id),
      options.repository.listSessionBenchmarks(session.id),
      options.repository.listEvents(session.id),
    ])
    return { session: { id: session.id, status: session.status, startedAt: session.startedAt }, units, evolutions, benchmarks, events }
  })

  app.post<{ Params: { id: string } }>('/api/sessions/:id/events', async (request, reply) => {
    const claims = verifySessionToken(bearerToken(request), options.signingSecret)
    if (claims.sessionId !== request.params.id) return reply.code(403).send({ error: 'Session token does not match this session.' })
    const input = domainEventSchema.omit({ id: true, sessionId: true, occurredAt: true, actorClientId: true, actorName: true, actorUnit: true }).parse(request.body)
    const event = domainEventSchema.parse({ ...input, id: randomUUID(), sessionId: claims.sessionId, occurredAt: new Date().toISOString(), actorClientId: claims.clientId, actorName: claims.name, actorUnit: claims.unit })
    await options.repository.appendEvent(event)
    return reply.code(201).send(event)
  })

  app.post<{ Params: { id: string } }>('/api/sessions/:id/instructor-events', async (request, reply) => {
    const controller = verifyControllerToken(bearerToken(request), options.signingSecret)
    const session = await options.repository.getSession(request.params.id)
    if (!session) return reply.code(404).send({ error: 'Session not found.' })
    const body = request.body as { eventType?: unknown; metadata?: unknown }
    if (typeof body.eventType !== 'string' || !body.eventType.trim()) return reply.code(400).send({ error: 'Event type is required.' })
    const origin = session.startedAt ?? session.createdAt
    const event = domainEventSchema.parse({ id: randomUUID(), sessionId: session.id, workspace: 'operations', elapsedMs: Math.max(0, Date.now() - new Date(origin).getTime()), occurredAt: new Date().toISOString(), actorClientId: controller.clientId, actorName: 'Instructor', actorUnit: 'INSTRUCTOR', eventType: body.eventType, metadata: typeof body.metadata === 'object' && body.metadata ? body.metadata : {} })
    await options.repository.appendEvent(event)
    return reply.code(201).send(event)
  })

  app.get<{ Params: { id: string } }>('/api/sessions/:id/events', async (request, reply) => {
    const token = bearerToken(request)
    try {
      const claims = verifySessionToken(token, options.signingSecret)
      if (claims.sessionId !== request.params.id) return reply.code(403).send({ error: 'Session token does not match this session.' })
    } catch {
      verifyControllerToken(token, options.signingSecret)
    }
    return { items: await options.repository.listEvents(request.params.id) }
  })

  return app
}
