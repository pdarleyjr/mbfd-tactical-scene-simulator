import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { BootstrapResponse } from '../api/types'

export function useBootstrap(sessionId: string, token: string | undefined) {
  const cacheKey = `mbfd-bootstrap-${sessionId}`
  const cached = typeof window === 'undefined' ? undefined : (() => {
    try {
      const value = JSON.parse(localStorage.getItem(cacheKey) ?? 'null') as BootstrapResponse | null
      return value ?? undefined
    }
    catch { return undefined }
  })()
  return useQuery({
    queryKey: ['bootstrap', sessionId, token],
    queryFn: async () => {
      try {
        const response = await api<BootstrapResponse>(`/api/sessions/${sessionId}/bootstrap`, { token })
        localStorage.setItem(cacheKey, JSON.stringify(response))
        return response
      } catch (error) {
        const fallback = localStorage.getItem(cacheKey)
        if (fallback && !navigator.onLine) return JSON.parse(fallback) as BootstrapResponse
        throw error
      }
    },
    ...(cached ? { initialData: cached, initialDataUpdatedAt: 0 } : {}),
    enabled: Boolean(sessionId && token),
  })
}
