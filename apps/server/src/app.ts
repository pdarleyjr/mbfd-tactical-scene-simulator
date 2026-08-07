import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import fastifyMultipart from '@fastify/multipart'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import {
  createSessionInputSchema,
  domainEventSchema,
  joinSessionInputSchema,
  scenarioInputSchema,
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

  app.post('/api/sessions', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    const input = createSessionInputSchema.parse(request.body)
    if (!(await options.repository.getScenario(input.scenarioId))) return reply.code(404).send({ error: 'Scenario not found.' })
    const session = await options.repository.createSession({
      ...input,
      status: 'setup',
      presentationMode: 'operations',
    })
    return reply.code(201).send(session)
  })

  app.get('/api/sessions', async (request) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
    return { items: await options.repository.listSessions() }
  })

  app.patch<{ Params: { id: string } }>('/api/sessions/:id', async (request, reply) => {
    verifyControllerToken(bearerToken(request), options.signingSecret)
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
    return updated
  })

  app.get<{ Params: { code: string } }>('/api/sessions/code/:code', async (request, reply) => {
    const session = await options.repository.getSessionByCode(request.params.code)
    if (!session) return reply.code(404).send({ error: 'Session code not found.' })
    const scenario = await options.repository.getScenario(session.scenarioId)
    return { session: { id: session.id, code: session.code, mode300: session.mode300, status: session.status, participatingUnits: session.participatingUnits }, scenario: scenario ? scenarioResponse(scenario) : undefined }
  })

  app.post('/api/sessions/join', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const input = joinSessionInputSchema.parse(request.body)
    const session = await options.repository.getSessionByCode(input.code)
    if (!session) return reply.code(404).send({ error: 'Session code not found.' })
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
    return { token, session, clientId }
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
    return { session, scenario: scenario ? scenarioResponse(scenario) : undefined, participants, role }
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
    return { session: updated, planPreserved: Boolean(currentPlan) }
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
