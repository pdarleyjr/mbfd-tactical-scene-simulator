import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { MemoryRepository } from './repository/memory.js'
import { verifySessionToken } from './security/tokens.js'

async function setup(now?: () => Date) {
  const repository = new MemoryRepository()
  const app = await createApp({
    repository,
    signingSecret: 'test-signing-secret-with-enough-length',
    instructorPin: '246810',
    assetStoragePath: 'test-assets',
    publicBaseUrl: 'http://localhost:8230',
    enableRateLimit: false,
    ...(now ? { now } : {}),
  })
  return { app, repository }
}

describe('session and authorization API', () => {
  it('rejects an incorrect instructor PIN and issues a signed controller token for the configured PIN', async () => {
    const { app } = await setup()
    const rejected = await app.inject({ method: 'POST', url: '/api/instructor/session', payload: { pin: '000000' } })
    const accepted = await app.inject({ method: 'POST', url: '/api/instructor/session', payload: { pin: '246810' } })

    expect(rejected.statusCode).toBe(401)
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().token).toEqual(expect.any(String))
    await app.close()
  })

  it('creates a session and allows several participants to join the same company', async () => {
    const { app } = await setup()
    const login = await app.inject({ method: 'POST', url: '/api/instructor/session', payload: { pin: '246810' } })
    const token = login.json().token as string
    const scenarios = await app.inject({ method: 'GET', url: '/api/scenarios' })
    const scenarioId = scenarios.json().items[0].id as string
    const room = await app.inject({ method: 'POST', url: '/api/rooms', headers: { authorization: `Bearer ${token}` }, payload: { name: 'Company Training Room' } })
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: { roomId: room.json().id, scenarioId, participatingUnits: ['E1', 'E2', 'E3', 'E4', 'L1', 'L3'], mode300: 'independent', benchmarkIds: [] },
    })
    const sessionId = created.json().id as string

    const captain = await app.inject({ method: 'POST', url: '/api/sessions/join', payload: { sessionId, name: 'Captain', role: 'crew', unit: 'E2', clientId: 'captain-client' } })
    const engineer = await app.inject({ method: 'POST', url: '/api/sessions/join', payload: { sessionId, name: 'Engineer', role: 'crew', unit: 'E2', clientId: 'engineer-client' } })

    expect(created.statusCode).toBe(201)
    expect(captain.statusCode).toBe(200)
    expect(engineer.statusCode).toBe(200)
    expect(captain.json().session.id).toBe(engineer.json().session.id)
    await app.close()
  })

  it('lists selectable rooms and enforces a room PIN only when the instructor configured one', async () => {
    const { app } = await setup()
    const login = await app.inject({ method: 'POST', url: '/api/instructor/session', payload: { pin: '246810' } })
    const authorization = { authorization: `Bearer ${login.json().token as string}` }
    const scenarioId = (await app.inject({ method: 'GET', url: '/api/scenarios' })).json().items[0].id as string
    const lockedRoom = await app.inject({ method: 'POST', url: '/api/rooms', headers: authorization, payload: { name: 'Locked Training Room', accessPin: '4412' } })
    const openRoom = await app.inject({ method: 'POST', url: '/api/rooms', headers: authorization, payload: { name: 'Open Training Room' } })
    const lockedSession = await app.inject({ method: 'POST', url: '/api/sessions', headers: authorization, payload: { roomId: lockedRoom.json().id, scenarioId, participatingUnits: ['E1'], mode300: 'live', benchmarkIds: [] } })
    const openSession = await app.inject({ method: 'POST', url: '/api/sessions', headers: authorization, payload: { roomId: openRoom.json().id, scenarioId, participatingUnits: ['E2'], mode300: 'live', benchmarkIds: [] } })

    const rooms = await app.inject({ method: 'GET', url: '/api/rooms' })
    const lockedWithoutPin = await app.inject({ method: 'POST', url: '/api/sessions/join', payload: { sessionId: lockedSession.json().id, name: 'Smith', role: 'crew', unit: 'E1' } })
    const lockedWithPin = await app.inject({ method: 'POST', url: '/api/sessions/join', payload: { sessionId: lockedSession.json().id, roomPin: '4412', name: 'Smith', role: 'crew', unit: 'E1' } })
    const openWithoutPin = await app.inject({ method: 'POST', url: '/api/sessions/join', payload: { sessionId: openSession.json().id, name: 'Jones', role: 'crew', unit: 'E2' } })

    expect(rooms.statusCode).toBe(200)
    expect(rooms.json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lockedRoom.json().id, name: 'Locked Training Room', locked: true, currentSession: expect.objectContaining({ id: lockedSession.json().id }) }),
      expect.objectContaining({ id: openRoom.json().id, name: 'Open Training Room', locked: false, currentSession: expect.objectContaining({ id: openSession.json().id }) }),
    ]))
    expect(lockedWithoutPin.statusCode).toBe(403)
    expect(lockedWithPin.statusCode).toBe(200)
    expect(openWithoutPin.statusCode).toBe(200)
    await app.close()
  })

  it('gates work by instructor-recorded arrival and timestamps evolutions and benchmarks', async () => {
    const { app } = await setup()
    const login = await app.inject({ method: 'POST', url: '/api/instructor/session', payload: { pin: '246810' } })
    const instructorToken = login.json().token as string
    const authorization = { authorization: `Bearer ${instructorToken}` }
    const sourceScenario = (await app.inject({ method: 'GET', url: '/api/scenarios' })).json().items[0]
    const updatedScenario = await app.inject({
      method: 'PATCH', url: `/api/scenarios/${sourceScenario.id}`, headers: authorization,
      payload: { benchmarks: [{ id: 'water-established', label: 'Water supply established', description: 'Sustained supply is connected.' }] },
    })
    const room = await app.inject({ method: 'POST', url: '/api/rooms', headers: authorization, payload: { name: 'Evolution Test Room' } })
    const created = await app.inject({
      method: 'POST', url: '/api/sessions', headers: authorization,
      payload: { roomId: room.json().id, scenarioId: updatedScenario.json().id, participatingUnits: ['E1'], mode300: 'live', benchmarkIds: ['water-established'] },
    })
    const sessionId = created.json().id as string
    await app.inject({ method: 'PATCH', url: `/api/sessions/${sessionId}`, headers: authorization, payload: { status: 'running' } })
    const joined = await app.inject({ method: 'POST', url: '/api/sessions/join', payload: { sessionId, name: 'Smith', role: 'crew', unit: 'E1', clientId: 'e1-smith' } })
    const participantAuthorization = { authorization: `Bearer ${joined.json().token as string}` }
    const blocked = await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/evolutions`, headers: participantAuthorization, payload: { evolutionId: 'jumpline' } })
    const arrived = await app.inject({ method: 'PATCH', url: `/api/sessions/${sessionId}/units/E1`, headers: authorization, payload: { status: 'arrived' } })
    const started = await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/evolutions`, headers: participantAuthorization, payload: { evolutionId: 'jumpline' } })
    const completed = await app.inject({ method: 'PATCH', url: `/api/sessions/${sessionId}/evolutions/${started.json().id}`, headers: participantAuthorization, payload: { status: 'complete' } })
    const benchmark = await app.inject({ method: 'PATCH', url: `/api/sessions/${sessionId}/benchmarks/${created.json().benchmarks[0].id}`, headers: authorization, payload: { completed: true } })
    const activity = await app.inject({ method: 'GET', url: `/api/sessions/${sessionId}/activity`, headers: authorization })

    expect(blocked.statusCode).toBe(409)
    expect(arrived.json()).toEqual(expect.objectContaining({ unit: 'E1', status: 'arrived', arrivedAt: expect.any(String) }))
    expect(started.json()).toEqual(expect.objectContaining({ evolutionId: 'jumpline', unit: 'E1', startedAt: expect.any(String) }))
    expect(completed.json()).toEqual(expect.objectContaining({ status: 'complete', completedAt: expect.any(String) }))
    expect(benchmark.json()).toEqual(expect.objectContaining({ completedAt: expect.any(String), completedElapsedMs: expect.any(Number) }))
    expect(activity.json()).toEqual(expect.objectContaining({
      units: [expect.objectContaining({ unit: 'E1', status: 'arrived' })],
      evolutions: [expect.objectContaining({ evolutionId: 'jumpline', status: 'complete' })],
      benchmarks: [expect.objectContaining({ label: 'Water supply established', completedAt: expect.any(String) })],
    }))
    await app.close()
  })

  it('issues Independent 300 claims, then preserves the plan while switching 300 to hybrid access', async () => {
    const { app, repository } = await setup()
    const login = await app.inject({ method: 'POST', url: '/api/instructor/session', payload: { pin: '246810' } })
    const instructorToken = login.json().token as string
    const scenarioId = (await app.inject({ method: 'GET', url: '/api/scenarios' })).json().items[0].id as string
    const room = await app.inject({ method: 'POST', url: '/api/rooms', headers: { authorization: `Bearer ${instructorToken}` }, payload: { name: 'Command Training Room' } })
    const created = await app.inject({
      method: 'POST', url: '/api/sessions', headers: { authorization: `Bearer ${instructorToken}` },
      payload: { roomId: room.json().id, scenarioId, participatingUnits: ['E1', '300'], mode300: 'independent', benchmarkIds: [] },
    })
    const { id } = created.json()
    const joined = await app.inject({ method: 'POST', url: '/api/sessions/join', payload: { sessionId: id, name: 'Command', role: 'command300', unit: '300', clientId: 'command-client' } })
    const claims = verifySessionToken(joined.json().token, 'test-signing-secret-with-enough-length')

    expect(claims.mode300).toBe('independent')
    await repository.saveYDocument(`session-${id}/300-plan`, new Uint8Array([1, 2, 3]))
    const switched = await app.inject({
      method: 'POST', url: `/api/sessions/${id}/300/join-operations`, headers: { authorization: `Bearer ${instructorToken}` },
    })
    const session = await repository.getSession(id)

    expect(switched.statusCode).toBe(200)
    expect(session?.mode300).toBe('hybrid')
    expect(session?.frozen300Plan).toEqual(new Uint8Array([1, 2, 3]))
    await app.close()
  })

  it('supports instructor lifecycle controls, presentation credentials, events, and safe scenario deletion', async () => {
    const { app } = await setup()
    const login = await app.inject({ method: 'POST', url: '/api/instructor/session', payload: { pin: '246810' } })
    const token = login.json().token as string
    const authorization = { authorization: `Bearer ${token}` }
    const scenario = (await app.inject({ method: 'GET', url: '/api/scenarios' })).json().items[0]
    expect(scenario.assets[0].runtimeUrl).toMatch(/^\/scenario-assets\//)

    const duplicate = await app.inject({ method: 'POST', url: `/api/scenarios/${scenario.id}/duplicate`, headers: authorization })
    expect(duplicate.statusCode).toBe(201)
    const deleted = await app.inject({ method: 'DELETE', url: `/api/scenarios/${duplicate.json().id}`, headers: authorization })
    expect(deleted.statusCode).toBe(204)

    const room = await app.inject({ method: 'POST', url: '/api/rooms', headers: authorization, payload: { name: 'Lifecycle Training Room' } })
    const created = await app.inject({ method: 'POST', url: '/api/sessions', headers: authorization, payload: { roomId: room.json().id, scenarioId: scenario.id, participatingUnits: ['E1', '300'], mode300: 'live', benchmarkIds: [] } })
    const sessionId = created.json().id as string
    const updated = await app.inject({ method: 'PATCH', url: `/api/sessions/${sessionId}`, headers: authorization, payload: { status: 'running', presentationMode: 'split' } })
    expect(updated.json()).toEqual(expect.objectContaining({ status: 'running', presentationMode: 'split', startedAt: expect.any(String) }))
    expect((await app.inject({ method: 'GET', url: '/api/sessions', headers: authorization })).json().items).toHaveLength(1)
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/presentation-token`, headers: authorization })).json().token).toEqual(expect.any(String))
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/instructor-events`, headers: authorization, payload: { eventType: 'inject-revealed', metadata: { index: 0 } } })).statusCode).toBe(201)
    expect((await app.inject({ method: 'GET', url: `/api/sessions/${sessionId}/events`, headers: authorization })).json().items).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'session-running' }),
      expect.objectContaining({ eventType: 'inject-revealed' }),
    ]))
    expect((await app.inject({ method: 'DELETE', url: `/api/scenarios/${scenario.id}`, headers: authorization })).statusCode).toBe(204)
    expect((await app.inject({ method: 'GET', url: '/api/scenarios' })).json().items).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: scenario.id }),
    ]))
    expect((await app.inject({ method: 'GET', url: `/api/scenarios/${scenario.id}` })).statusCode).toBe(200)
    await app.close()
  })

  it('starts, pauses, resumes, and completes a scenario timer without counting frozen time', async () => {
    let clock = new Date('2026-08-10T12:00:00.000Z')
    const { app } = await setup(() => clock)
    const login = await app.inject({ method: 'POST', url: '/api/instructor/session', payload: { pin: '246810' } })
    const authorization = { authorization: `Bearer ${login.json().token as string}` }
    const scenarioId = (await app.inject({ method: 'GET', url: '/api/scenarios' })).json().items[0].id as string
    const room = await app.inject({ method: 'POST', url: '/api/rooms', headers: authorization, payload: { name: 'Timer Training Room' } })
    const created = await app.inject({ method: 'POST', url: '/api/sessions', headers: authorization, payload: { roomId: room.json().id, scenarioId, participatingUnits: ['E1'], mode300: 'live', benchmarkIds: [] } })
    const sessionId = created.json().id as string

    const started = await app.inject({ method: 'PATCH', url: `/api/sessions/${sessionId}`, headers: authorization, payload: { status: 'running' } })
    expect(started.json()).toEqual(expect.objectContaining({ status: 'running', elapsedMs: 0 }))
    clock = new Date('2026-08-10T12:01:05.000Z')
    const frozen = await app.inject({ method: 'PATCH', url: `/api/sessions/${sessionId}`, headers: authorization, payload: { status: 'frozen' } })
    expect(frozen.json().elapsedMs).toBe(65_000)
    clock = new Date('2026-08-10T12:01:35.000Z')
    const whileFrozen = await app.inject({ method: 'GET', url: `/api/sessions/${sessionId}/bootstrap`, headers: authorization })
    expect(whileFrozen.json().session.elapsedMs).toBe(65_000)
    await app.inject({ method: 'PATCH', url: `/api/sessions/${sessionId}`, headers: authorization, payload: { status: 'running' } })
    clock = new Date('2026-08-10T12:01:40.000Z')
    const completed = await app.inject({ method: 'PATCH', url: `/api/sessions/${sessionId}`, headers: authorization, payload: { status: 'complete' } })
    expect(completed.json().elapsedMs).toBe(70_000)

    await app.close()
  })
})
