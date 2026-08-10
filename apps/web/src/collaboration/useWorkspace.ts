import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HocuspocusProvider } from '@hocuspocus/provider'
import { IndexeddbPersistence } from 'y-indexeddb'
import * as Y from 'yjs'
import type { FiregroundObject, Workspace } from '@mbfd/domain'
import { collectionForObject, documentName, ensureTacticalDocument, listFiregroundObjects } from '@mbfd/collaboration'

export type ConnectionStatus = 'connecting' | 'connected' | 'offline' | 'error'

function collaborationUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${window.location.host}/collab`
}

export function useWorkspace(input: {
  sessionId: string
  workspace: Workspace
  token: string
  identity: { clientId: string; name: string; unit: string; role: string }
  enabled?: boolean
  onAuthenticationFailed?: () => void
}) {
  const enabled = input.enabled
  const token = input.token
  const clientId = input.identity.clientId
  const identityName = input.identity.name
  const identityUnit = input.identity.unit
  const identityRole = input.identity.role
  const onAuthenticationFailed = input.onAuthenticationFailed
  const [objects, setObjects] = useState<FiregroundObject[]>([])
  const [status, setStatus] = useState<ConnectionStatus>('connecting')
  const [presence, setPresence] = useState<Array<Record<string, unknown>>>([])
  const name = documentName(input.sessionId, input.workspace)
  const document = useMemo(() => new Y.Doc({ guid: name }), [name])
  const providerRef = useRef<HocuspocusProvider | null>(null)

  useEffect(() => {
    if (enabled === false) return
    ensureTacticalDocument(document)
    const persistence = new IndexeddbPersistence(name, document)
    let authenticationRejected = false
    const handleOnline = () => setStatus('connecting')
    const handleOffline = () => setStatus('offline')
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    const provider = new HocuspocusProvider({
      url: collaborationUrl(),
      name,
      document,
      token,
      onStatus: ({ status: providerStatus }) => setStatus(providerStatus === 'connected' ? 'connected' : 'connecting'),
      onClose: () => setStatus(authenticationRejected ? 'error' : navigator.onLine ? 'connecting' : 'offline'),
      onAuthenticationFailed: () => {
        authenticationRejected = true
        setStatus('error')
        onAuthenticationFailed?.()
        queueMicrotask(() => provider.destroy())
      },
    })
    providerRef.current = provider
    provider.setAwarenessField('user', { clientId, name: identityName, unit: identityUnit, role: identityRole })

    const refresh = () => setObjects(listFiregroundObjects(document))
    const refreshPresence = () => setPresence(Array.from(provider.awareness?.getStates().values() ?? []).map((state) => state as Record<string, unknown>))
    document.on('update', refresh)
    provider.on('awarenessUpdate', refreshPresence)
    void persistence.whenSynced.then(refresh)
    refresh()

    return () => {
      document.off('update', refresh)
      provider.off('awarenessUpdate', refreshPresence)
      provider.destroy()
      providerRef.current = null
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      void persistence.destroy()
    }
  }, [clientId, document, enabled, identityName, identityRole, identityUnit, name, onAuthenticationFailed, token])

  useEffect(() => () => document.destroy(), [document])

  const upsertObject = useCallback((object: FiregroundObject) => {
    document.transact(() => {
      document.getMap<FiregroundObject>(collectionForObject(object)).set(object.id, object)
    }, { source: 'semantic-object-upsert' })
  }, [document])

  const removeObject = useCallback((object: FiregroundObject) => {
    document.transact(() => {
      document.getMap(collectionForObject(object)).delete(object.id)
    }, { source: 'semantic-object-delete' })
  }, [document])

  const setCursor = useCallback((cursor: { x: number; y: number }) => {
    providerRef.current?.setAwarenessField('cursor', cursor)
  }, [])

  return { document, objects, status, presence, upsertObject, removeObject, setCursor }
}
