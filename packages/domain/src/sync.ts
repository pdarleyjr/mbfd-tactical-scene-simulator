import { z } from 'zod'
import { boardSchema, runSchema, scenarioSchema, sceneObjectSchema, snapshotSchema, timelineEntrySchema, trainingSchema, type Board, type SceneObject } from './scene.js'

/**
 * Live shared scenes: the wire protocol between browsers and the sync
 * service. A patch carries only what changed. Objects merge per object
 * (last write wins); scenario, training, and snapshots replace as a whole.
 */

export const MAIN_SCENE_ID = 'main'
/** Most objects a live scene may hold (the same limit the board schema enforces). */
export const MAX_SCENE_OBJECTS = 5000
export const sceneIdSchema = z.string().regex(/^[a-z0-9]{4,24}$/, 'Scene ids are 4–24 lowercase letters or digits.')

const idList = z.array(z.string().min(1).max(128)).max(5000)

/** Which scenario a board is: its template, or 'custom' for a board built on an uploaded map. */
export const scenarioKeySchema = z.string().regex(/^[a-z0-9-]{1,64}$/)
export function scenarioKey(board: Pick<Board, 'templateId'>): string {
  const id = board.templateId
  return id && scenarioKeySchema.safeParse(id).success ? id : 'custom'
}

export const scenePatchSchema = z.object({
  upserts: z.array(sceneObjectSchema).max(5000).optional(),
  removes: idList.optional(),
  order: idList.optional(),
  scenario: scenarioSchema.optional(),
  training: trainingSchema.optional(),
  snapshots: z.array(snapshotSchema).max(100).optional(),
  run: runSchema.nullable().optional(),
  runAppend: z.array(timelineEntrySchema).max(2000).optional(),
  name: z.string().trim().min(1).max(120).optional(),
})

export type ScenePatch = z.infer<typeof scenePatchSchema>

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), clientId: z.string().min(1).max(64), seed: boardSchema }),
  // on names the scenario the change was made on; a change that arrives after a switch is dropped.
  z.object({ type: z.literal('patch'), id: z.string().min(1).max(64), patch: scenePatchSchema, on: scenarioKeySchema }),
  // Switches everyone in the scene to another scenario. The current one is kept and comes back on switching back.
  z.object({ type: z.literal('switch'), id: z.string().min(1).max(64), key: scenarioKeySchema, seed: boardSchema })
    .refine((message) => scenarioKey(message.seed) === message.key, { message: 'The starting board does not match the scenario.' }),
  z.object({ type: z.literal('ping') }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>

export type ServerMessage =
  | { type: 'state'; board: Board; version: number; now: number; peers: number }
  | { type: 'patch'; from: string; version: number; patch: ScenePatch }
  | { type: 'replace'; from: string; version: number; board: Board; reason?: 'restore' | 'switch' | undefined }
  | { type: 'ack'; id: string; version: number }
  | { type: 'presence'; peers: number }
  | { type: 'error'; message: string; id?: string | undefined }
  | { type: 'pong'; now: number }

export function isEmptyPatch(patch: ScenePatch): boolean {
  return Object.values(patch).every((value) => value === undefined || (Array.isArray(value) && value.length === 0))
}

/** Applies a patch to a board. Pure: returns a new board, never mutates. */
export function applyScenePatch(board: Board, patch: ScenePatch): Board {
  let objects: SceneObject[] = board.objects
  if (patch.upserts?.length || patch.removes?.length || patch.order) {
    const removed = new Set(patch.removes ?? [])
    const upserts = new Map((patch.upserts ?? []).map((object) => [object.id, object]))
    const next: SceneObject[] = []
    for (const object of objects) {
      if (removed.has(object.id)) continue
      next.push(upserts.get(object.id) ?? object)
      upserts.delete(object.id)
    }
    for (const object of upserts.values()) if (!removed.has(object.id)) next.push(object)
    if (patch.order) {
      const position = new Map(patch.order.map((id, index) => [id, index]))
      next.sort((a, b) => (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (position.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    }
    objects = next
  }
  let run = patch.run !== undefined ? patch.run : board.run
  if (patch.runAppend?.length && run) run = { ...run, entries: [...run.entries, ...patch.runAppend].slice(-20_000) }
  return {
    ...board,
    objects,
    ...(patch.scenario ? { scenario: patch.scenario } : {}),
    ...(patch.training ? { training: patch.training } : {}),
    ...(patch.snapshots ? { snapshots: patch.snapshots } : {}),
    ...(patch.name ? { name: patch.name } : {}),
    run,
    updatedAt: new Date().toISOString(),
  }
}

/** Describes how `next` differs from `previous`, for sending to the room. */
export function diffBoards(previous: Board, next: Board): ScenePatch {
  const patch: ScenePatch = {}
  if (previous.objects !== next.objects) {
    const before = new Map(previous.objects.map((object) => [object.id, object]))
    const after = new Set(next.objects.map((object) => object.id))
    const upserts = next.objects.filter((object) => before.get(object.id) !== object)
    const removes = previous.objects.filter((object) => !after.has(object.id)).map((object) => object.id)
    const survivingBefore = previous.objects.filter((object) => after.has(object.id)).map((object) => object.id)
    const survivingAfter = next.objects.filter((object) => before.has(object.id)).map((object) => object.id)
    if (upserts.length) patch.upserts = upserts
    if (removes.length) patch.removes = removes
    if (survivingBefore.some((id, index) => survivingAfter[index] !== id)) patch.order = next.objects.map((object) => object.id)
  }
  if (previous.scenario !== next.scenario) patch.scenario = next.scenario
  if (previous.training !== next.training) patch.training = next.training
  if (previous.snapshots !== next.snapshots) patch.snapshots = next.snapshots
  if (previous.name !== next.name) patch.name = next.name
  if (previous.run !== next.run) {
    const before = previous.run
    const after = next.run
    const appendOnly = before && after && before.startedAt === after.startedAt && before.base === after.base && after.entries.length >= before.entries.length && before.entries.every((entry, index) => after.entries[index] === entry)
    if (appendOnly) {
      const added = after.entries.slice(before.entries.length)
      if (added.length) patch.runAppend = added
    } else {
      patch.run = after
    }
  }
  return patch
}

/**
 * Someone else's patch, minus whatever this browser has changed but the server
 * has not applied yet. The server will apply the local changes after the
 * remote one, so they win there; leaving them out here makes every screen end
 * up the same.
 */
export function withoutPendingChanges(remote: ScenePatch, pending: readonly ScenePatch[]): ScenePatch {
  const touched = new Set<string>()
  let order = false
  let run = false
  const fields = new Set<'scenario' | 'training' | 'snapshots' | 'name'>()
  for (const patch of pending) {
    for (const object of patch.upserts ?? []) touched.add(object.id)
    for (const id of patch.removes ?? []) touched.add(id)
    if (patch.order) order = true
    if (patch.run !== undefined || patch.runAppend?.length) run = true
    for (const field of ['scenario', 'training', 'snapshots', 'name'] as const) if (patch[field] !== undefined) fields.add(field)
  }
  if (!touched.size && !order && !run && !fields.size) return remote
  const result: ScenePatch = {}
  const upserts = remote.upserts?.filter((object) => !touched.has(object.id))
  const removes = remote.removes?.filter((id) => !touched.has(id))
  if (upserts?.length) result.upserts = upserts
  if (removes?.length) result.removes = removes
  if (remote.order && !order) result.order = remote.order
  if (!run) {
    if (remote.run !== undefined) result.run = remote.run
    if (remote.runAppend) result.runAppend = remote.runAppend
  }
  for (const field of ['scenario', 'training', 'snapshots', 'name'] as const) {
    if (remote[field] !== undefined && !fields.has(field)) Object.assign(result, { [field]: remote[field] })
  }
  return result
}

/** Short, unguessable-enough id for a separate scene link. */
export function newSceneId(random: () => number = Math.random): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let id = ''
  for (let index = 0; index < 8; index += 1) id += alphabet[Math.floor(random() * alphabet.length)]
  return id
}
