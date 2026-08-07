import { randomUUID } from 'node:crypto'
import { Database } from '@hocuspocus/extension-database'
import { Server } from '@hocuspocus/server'
import * as Y from 'yjs'
import { firegroundObjectSchema, type TokenClaims } from '@mbfd/domain'
import {
  authorizeDocument,
  authorizeObjectChange,
  defaultPermissions,
  documentSnapshot,
  parseDocumentName,
  tacticalCollections,
} from '@mbfd/collaboration'
import type { TacticalRepository } from '../repository/repository.js'
import { verifyControllerToken, verifySessionToken } from '../security/tokens.js'

interface ChangeRecord {
  action: 'added' | 'updated' | 'deleted'
  objectId: string
  objectType: string
}

interface CollaborationContext {
  claims: TokenClaims
  pendingChanges?: ChangeRecord[]
}

function changedObjects(before: ReturnType<typeof documentSnapshot>, after: ReturnType<typeof documentSnapshot>) {
  const changes: Array<{ before?: unknown; after?: unknown; collection: string; id: string }> = []
  for (const collection of tacticalCollections) {
    if (collection === 'evolutionInstances') continue
    const ids = new Set([...Object.keys(before[collection]), ...Object.keys(after[collection])])
    for (const id of ids) {
      const beforeObject = before[collection][id]
      const afterObject = after[collection][id]
      if (JSON.stringify(beforeObject) !== JSON.stringify(afterObject)) changes.push({ ...(beforeObject === undefined ? {} : { before: beforeObject }), ...(afterObject === undefined ? {} : { after: afterObject }), collection, id })
    }
  }
  return changes
}

export function createCollaborationServer(options: {
  repository: TacticalRepository
  signingSecret: string
  port: number
}) {
  const server = new Server({
    name: 'mbfd-tactical-scene-simulator',
    port: options.port,
    debounce: 750,
    maxDebounce: 4_000,
    extensions: [
      new Database({
        fetch: async ({ documentName }) => (await options.repository.loadYDocument(documentName)) ?? null,
        store: async ({ documentName, state }) => options.repository.saveYDocument(documentName, state),
      }),
    ],
    async onAuthenticate(data) {
      const parsed = parseDocumentName(data.documentName)
      if (!parsed) throw new Error('Invalid collaboration document name.')
      let claims: TokenClaims
      try {
        claims = verifySessionToken(data.token, options.signingSecret)
      } catch {
        const controller = verifyControllerToken(data.token, options.signingSecret)
        const now = Math.floor(Date.now() / 1000)
        claims = {
          sessionId: parsed.sessionId,
          clientId: controller.clientId,
          name: 'Instructor',
          unit: 'INSTRUCTOR',
          role: 'instructor',
          mode300: 'hybrid',
          permissions: defaultPermissions('instructor'),
          iat: now,
          exp: controller.exp,
          jti: controller.jti,
        }
      }
      const session = await options.repository.getSession(claims.sessionId)
      if (!session) throw new Error('Training session no longer exists.')
      claims = { ...claims, mode300: session.mode300 }
      const authorization = authorizeDocument(claims, data.documentName)
      if (!authorization.allowed) throw new Error(authorization.reason ?? 'Document access denied.')
      if (authorization.readOnly) data.connectionConfig.readOnly = true
      return { claims } satisfies CollaborationContext
    },
    async beforeSync(data) {
      const context = data.context as CollaborationContext
      if (context.claims.exp <= Math.floor(Date.now() / 1000)) throw new Error('Session token expired.')
      if (data.type !== 1 && data.type !== 2) return
      const before = documentSnapshot(data.document)
      const candidate = new Y.Doc()
      Y.applyUpdate(candidate, Y.encodeStateAsUpdate(data.document))
      Y.applyUpdate(candidate, data.payload)
      const after = documentSnapshot(candidate)
      const changes = changedObjects(before, after)
      const eventChanges: ChangeRecord[] = []

      for (const change of changes) {
        const beforeResult = change.before === undefined ? undefined : firegroundObjectSchema.safeParse(change.before)
        const afterResult = change.after === undefined ? undefined : firegroundObjectSchema.safeParse(change.after)
        if (beforeResult && !beforeResult.success) throw new Error(`Existing ${change.collection} object is invalid.`)
        if (afterResult && !afterResult.success) throw new Error(`Updated ${change.collection} object is invalid.`)
        const authorization = authorizeObjectChange(context.claims, beforeResult?.data, afterResult?.data)
        if (!authorization.allowed) throw new Error(authorization.reason ?? 'Object mutation denied.')
        eventChanges.push({
          action: change.before === undefined ? 'added' : change.after === undefined ? 'deleted' : 'updated',
          objectId: change.id,
          objectType: beforeResult?.data.type ?? afterResult?.data.type ?? change.collection,
        })
      }
      context.pendingChanges = eventChanges
    },
    async onChange(data) {
      const context = data.context as CollaborationContext
      if (!context.pendingChanges?.length) return
      const parsed = parseDocumentName(data.documentName)
      const session = parsed ? await options.repository.getSession(parsed.sessionId) : undefined
      if (!parsed || !session) return
      const origin = session.startedAt ?? session.createdAt
      const elapsedMs = Math.max(0, Date.now() - new Date(origin).getTime())
      for (const change of context.pendingChanges) {
        await options.repository.appendEvent({
          id: randomUUID(),
          sessionId: parsed.sessionId,
          workspace: parsed.workspace,
          elapsedMs,
          occurredAt: new Date().toISOString(),
          actorClientId: context.claims.clientId,
          actorName: context.claims.name,
          actorUnit: context.claims.unit,
          eventType: `object-${change.action}`,
          objectId: change.objectId,
          metadata: { objectType: change.objectType },
        })
      }
      context.pendingChanges = []
    },
    async beforeHandleAwareness({ states, context }) {
      const collaborationContext = context as CollaborationContext | undefined
      for (const state of states.values()) {
        state.user = collaborationContext ? {
          clientId: collaborationContext.claims.clientId,
          name: collaborationContext.claims.name,
          unit: collaborationContext.claims.unit,
          role: collaborationContext.claims.role,
        } : null
      }
    },
  })

  return {
    listen: () => server.listen(options.port),
    destroy: () => server.destroy(),
    server,
  }
}
