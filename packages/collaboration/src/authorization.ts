import type { FiregroundObject, Mode300, ParticipantRole, Permission, TokenClaims, Workspace } from '@mbfd/domain'

export interface CollaborationClaims extends Omit<TokenClaims, 'exp' | 'iat' | 'jti' | 'permissions'> {
  permissions: readonly Permission[]
}

export interface AuthorizationResult {
  allowed: boolean
  readOnly?: boolean
  reason?: string
}

export function documentName(sessionId: string, workspace: Workspace): string {
  return `session-${sessionId}/${workspace}`
}

export function parseDocumentName(name: string): { sessionId: string; workspace: Workspace } | undefined {
  const match = /^session-(.+)\/(scenario|operations|300-plan)$/.exec(name)
  if (!match?.[1] || !match[2]) return undefined
  return { sessionId: match[1], workspace: match[2] as Workspace }
}

export function authorizeDocument(
  claims: Pick<CollaborationClaims, 'sessionId' | 'role' | 'mode300' | 'permissions'>,
  name: string,
): AuthorizationResult {
  const parsed = parseDocumentName(name)
  if (!parsed || parsed.sessionId !== claims.sessionId) return { allowed: false, reason: 'Document is outside this session.' }

  if (claims.role === 'presentation') return { allowed: true, readOnly: true }
  if (claims.role === 'instructor') return { allowed: true }
  if (parsed.workspace === 'scenario') return { allowed: true, readOnly: true }

  if (claims.role === 'crew') {
    return parsed.workspace === 'operations'
      ? { allowed: true }
      : { allowed: false, reason: 'Operations participants cannot access the private 300 plan.' }
  }

  if (claims.role === 'command300') {
    if (parsed.workspace === '300-plan') return { allowed: true }
    if (parsed.workspace === 'operations' && claims.mode300 !== 'independent') return { allowed: true }
    return { allowed: false, reason: 'Independent 300 cannot access Operations.' }
  }

  return { allowed: false, reason: 'Role is not authorized.' }
}

interface OwnershipShape {
  id: string
  type: FiregroundObject['type']
  createdByClientId: string
  createdByUnit: string
  [key: string]: unknown
}

export function authorizeObjectChange(
  claims: Pick<CollaborationClaims, 'clientId' | 'unit' | 'role' | 'permissions'>,
  before: OwnershipShape | undefined,
  after: OwnershipShape | undefined,
): AuthorizationResult {
  if (claims.role === 'instructor' || claims.permissions.includes('instructor-control')) return { allowed: true }
  if (!after && !before) return { allowed: false, reason: 'No object change was supplied.' }

  if (!before && after) {
    const createsOwnObject = after.createdByClientId === claims.clientId && after.createdByUnit === claims.unit
    const commandPlanningForAnyUnit = claims.role === 'command300'
    return createsOwnObject || commandPlanningForAnyUnit
      ? { allowed: true }
      : { allowed: false, reason: 'Participants may only create attributed objects for their unit.' }
  }

  if (before && !after) {
    return before.createdByUnit === claims.unit
      ? { allowed: true }
      : { allowed: false, reason: 'Participants may only delete objects owned by their unit.' }
  }

  if (claims.role === 'command300') return { allowed: true }
  if (before?.createdByUnit === claims.unit) return { allowed: true }
  if (claims.permissions.includes('move-other-units')) return { allowed: true }

  return { allowed: false, reason: `Unit ${claims.unit} cannot modify an object owned by ${before?.createdByUnit}.` }
}

export function defaultPermissions(role: ParticipantRole): Permission[] {
  if (role === 'instructor') return ['move-own-unit', 'annotate', 'command-markers', 'move-other-units', 'deploy-for-other-units', 'instructor-control']
  if (role === 'presentation') return ['read-only']
  if (role === 'command300') return ['move-own-unit', 'annotate', 'command-markers', 'move-other-units', 'deploy-for-other-units']
  return ['move-own-unit', 'annotate']
}

export function canCommandAccessOperations(mode: Mode300): boolean {
  return mode === 'live' || mode === 'hybrid'
}
