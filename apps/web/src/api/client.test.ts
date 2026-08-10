import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './client.js'

afterEach(() => vi.unstubAllGlobals())

describe('API client', () => {
  it('sends explicit JSON for a state-changing request with no supplied body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await api('/api/example', { method: 'POST', token: 'controller-token' })

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(request.body).toBe('{}')
    expect(new Headers(request.headers).get('content-type')).toBe('application/json')
  })
})
