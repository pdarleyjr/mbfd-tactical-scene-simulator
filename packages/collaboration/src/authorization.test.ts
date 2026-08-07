import { describe, expect, it } from 'vitest'
import {
  authorizeDocument,
  authorizeObjectChange,
  canCommandAccessOperations,
  defaultPermissions,
  documentName,
  parseDocumentName,
} from './index.js'

const baseClaims = {
  sessionId: 'session-1',
  clientId: 'client-e2',
  name: 'Jones',
  unit: 'E2',
  role: 'crew' as const,
  mode300: 'independent' as const,
  permissions: ['move-own-unit', 'annotate'] as const,
}

describe('collaboration authorization', () => {
  it('isolates Independent 300 from Operations while allowing instructors to read both', () => {
    const operations = documentName('session-1', 'operations')
    const plan = documentName('session-1', '300-plan')
    const command = { ...baseClaims, role: 'command300' as const, unit: '300' }
    const instructor = { ...baseClaims, role: 'instructor' as const, unit: 'INSTRUCTOR' }

    expect(authorizeDocument(command, operations).allowed).toBe(false)
    expect(authorizeDocument(command, plan).allowed).toBe(true)
    expect(authorizeDocument(instructor, operations).allowed).toBe(true)
    expect(authorizeDocument(instructor, plan).allowed).toBe(true)
    expect(parseDocumentName(plan)).toEqual({ sessionId: 'session-1', workspace: '300-plan' })
  })

  it('prevents E2 from moving E1 but permits E2 to create a compatible line to a shared wye', () => {
    const e1Apparatus = { id: 'e1', type: 'apparatus' as const, createdByClientId: 'e1-client', createdByUnit: 'E1' }
    expect(authorizeObjectChange(baseClaims, e1Apparatus, { ...e1Apparatus, x: 500 })).toEqual(expect.objectContaining({ allowed: false }))

    const e2Hose = {
      id: 'hose-e2',
      type: 'hoseSegment' as const,
      createdByClientId: 'client-e2',
      createdByUnit: 'E2',
      connectedFrom: { objectId: 'wye-e1', portId: 'outlet-b' },
    }
    expect(authorizeObjectChange(baseClaims, undefined, e2Hose)).toEqual(expect.objectContaining({ allowed: true }))
  })

  it('grants 300 access to Operations only after a hybrid transition without changing the plan document', () => {
    const command = { ...baseClaims, role: 'command300' as const, unit: '300', mode300: 'hybrid' as const }
    expect(authorizeDocument(command, documentName('session-1', 'operations')).allowed).toBe(true)
    expect(authorizeDocument(command, documentName('session-1', '300-plan')).allowed).toBe(true)
  })

  it('covers read-only scenario/presentation access and rejects malformed or cross-session documents', () => {
    expect(authorizeDocument(baseClaims, documentName('session-1', 'operations')).allowed).toBe(true)
    expect(authorizeDocument(baseClaims, documentName('session-1', '300-plan')).allowed).toBe(false)
    expect(authorizeDocument(baseClaims, documentName('session-1', 'scenario'))).toEqual({ allowed: true, readOnly: true })
    expect(authorizeDocument({ ...baseClaims, role: 'presentation' }, documentName('session-1', 'operations'))).toEqual({ allowed: true, readOnly: true })
    expect(authorizeDocument(baseClaims, documentName('another', 'operations')).allowed).toBe(false)
    expect(parseDocumentName('invalid')).toBeUndefined()
  })

  it('enforces create/delete/move ownership while honoring command and instructor grants', () => {
    const own = { id: 'own', type: 'annotation' as const, createdByClientId: baseClaims.clientId, createdByUnit: baseClaims.unit }
    const other = { ...own, id: 'other', createdByClientId: 'other-client', createdByUnit: 'E1' }
    expect(authorizeObjectChange(baseClaims, undefined, undefined).allowed).toBe(false)
    expect(authorizeObjectChange(baseClaims, undefined, other).allowed).toBe(false)
    expect(authorizeObjectChange(baseClaims, own, undefined).allowed).toBe(true)
    expect(authorizeObjectChange(baseClaims, other, undefined).allowed).toBe(false)
    expect(authorizeObjectChange(baseClaims, own, { ...own, x: 2 }).allowed).toBe(true)
    expect(authorizeObjectChange({ ...baseClaims, permissions: [...baseClaims.permissions, 'move-other-units'] }, other, { ...other, x: 2 }).allowed).toBe(true)
    expect(authorizeObjectChange({ ...baseClaims, role: 'command300' }, undefined, other).allowed).toBe(true)
    expect(authorizeObjectChange({ ...baseClaims, permissions: ['instructor-control'] }, other, undefined).allowed).toBe(true)
  })

  it('defines role permissions and command-mode visibility explicitly', () => {
    expect(defaultPermissions('instructor')).toContain('instructor-control')
    expect(defaultPermissions('presentation')).toEqual(['read-only'])
    expect(defaultPermissions('command300')).toContain('move-other-units')
    expect(defaultPermissions('crew')).toEqual(['move-own-unit', 'annotate'])
    expect(canCommandAccessOperations('independent')).toBe(false)
    expect(canCommandAccessOperations('live')).toBe(true)
    expect(canCommandAccessOperations('hybrid')).toBe(true)
  })
})
