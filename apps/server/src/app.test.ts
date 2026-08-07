import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { MemoryRepository } from './repository/memory.js'
import { verifySessionToken } from './security/tokens.js'

async function setup() {
  const repository = new MemoryRepository()
  const app = await createApp({
    repository,
    signingSecret: 'test-signing-secret-with-enough-length',
    instructorPin: '246810',
    assetStoragePath: 'test-assets',
    publicBaseUrl: 'http://localhost:8230',
    enableRateLimit: false,
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
    const created = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId, participatingUnits: ['E1', 'E2', 'E3', 'E4', 'L1', 'L3'], mode300: 'independent' },
    })
    const code = created.json().code as string

    const captain = await app.inject({ method: 'POST', url: '/api/sessions/join', payload: { code, name: 'Captain', role: 'crew', unit: 'E2', clientId: 'captain-client' } })
    const engineer = await app.inject({ method: 'POST', url: '/api/sessions/join', payload: { code, name: 'Engineer', role: 'crew', unit: 'E2', clientId: 'engineer-client' } })

    expect(created.statusCode).toBe(201)
    expect(captain.statusCode).toBe(200)
    expect(engineer.statusCode).toBe(200)
    expect(captain.json().session.id).toBe(engineer.json().session.id)
    await app.close()
  })

  it('issues Independent 300 claims, then preserves the plan while switching 300 to hybrid access', async () => {
    const { app, repository } = await setup()
    const login = await app.inject({ method: 'POST', url: '/api/instructor/session', payload: { pin: '246810' } })
    const instructorToken = login.json().token as string
    const scenarioId = (await app.inject({ method: 'GET', url: '/api/scenarios' })).json().items[0].id as string
    const created = await app.inject({
      method: 'POST', url: '/api/sessions', headers: { authorization: `Bearer ${instructorToken}` },
      payload: { scenarioId, participatingUnits: ['E1', '300'], mode300: 'independent' },
    })
    const { code, id } = created.json()
    const joined = await app.inject({ method: 'POST', url: '/api/sessions/join', payload: { code, name: 'Command', role: 'command300', unit: '300', clientId: 'command-client' } })
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

    const created = await app.inject({ method: 'POST', url: '/api/sessions', headers: authorization, payload: { scenarioId: scenario.id, participatingUnits: ['E1', '300'], mode300: 'live' } })
    const sessionId = created.json().id as string
    const updated = await app.inject({ method: 'PATCH', url: `/api/sessions/${sessionId}`, headers: authorization, payload: { status: 'running', presentationMode: 'split' } })
    expect(updated.json()).toEqual(expect.objectContaining({ status: 'running', presentationMode: 'split', startedAt: expect.any(String) }))
    expect((await app.inject({ method: 'GET', url: '/api/sessions', headers: authorization })).json().items).toHaveLength(1)
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/presentation-token`, headers: authorization })).json().token).toEqual(expect.any(String))
    expect((await app.inject({ method: 'POST', url: `/api/sessions/${sessionId}/instructor-events`, headers: authorization, payload: { eventType: 'inject-revealed', metadata: { index: 0 } } })).statusCode).toBe(201)
    expect((await app.inject({ method: 'GET', url: `/api/sessions/${sessionId}/events`, headers: authorization })).json().items).toHaveLength(1)
    expect((await app.inject({ method: 'DELETE', url: `/api/scenarios/${scenario.id}`, headers: authorization })).statusCode).toBe(400)
    await app.close()
  })
})
