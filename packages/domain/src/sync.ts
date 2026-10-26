import { z } from 'zod'
import { boardSchema, runSchema, scenarioSchema, sceneObjectSchema, snapshotSchema, timelineEntrySchema, trainingSchema, type Board, type SceneObject } from './scene.js'

/**
 * Live shared scenes: the wire protocol between browsers and the sync
 * service. A patch carries only what changed. Objects merge per object
 * (last write wins); scenario, training, and snapshots replace as a whole.
 */

export const MAIN_SCENE_ID = 'main'
export const sceneIdSchema = z.string().regex(/^[a-z0-9]{4,24}$/, 'Scene ids are 4–24 lowercase letters or digits.')

const idList = z.array(z.string().min(1).max(128)).max(5000)

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
  z.object({ type: z.literal('patch'), id: z.string().min(1).max(64), patch: scenePatchSchema }),
  z.object({ type: z.literal('replace'), id: z.string().min(1).max(64), board: boardSchema }),
  z.object({ type: z.literal('ping') }),
])

export type ClientMessage = z.infer<typeof clientMessageSchema>

export type ServerMessage =
  | { type: 'state'; board: Board; version: number; now: number; peers: number }
  | { type: 'patch'; from: string; version: number; patch: ScenePatch }
  | { type: 'replace'; from: string; version: number; board: Board }
  | { type: 'ack'; id: string; version: number }
  | { type: 'presence'; peers: number }
  | { type: 'error'; message: string }
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

/** Short, unguessable-enough id for a separate scene link. */
export function newSceneId(random: () => number = Math.random): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  let id = ''
  for (let index = 0; index < 8; index += 1) id += alphabet[Math.floor(random() * alphabet.length)]
  return id
}
