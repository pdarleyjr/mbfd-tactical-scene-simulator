import { WebSocket } from 'ws'
import { boardSchema, type Board, type SceneObject, type ServerMessage } from '@mbfd/domain'

/** Shared by the sync service tests: a scene builder and a test browser. */

export const note = (id: string, x = 0): SceneObject => ({ id, type: 'note', x, y: 0, rotation: 0, text: id, locked: false })

export function seed(objects: SceneObject[] = [], templateId: string | null = null, title = 'Drill'): Board {
  return boardSchema.parse({
    schemaVersion: 3,
    id: 'seed-board',
    name: 'Drill',
    templateId,
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
    scenario: {
      title, description: '', dispatch: '', background: { kind: 'builtin', url: '/map.webp' }, world: { width: 1000, height: 800 },
      northDegrees: 0, weather: { windFromDegrees: 0, windMph: 0, temperatureF: 80, conditions: '' }, injects: [], benchmarks: [],
    },
    objects,
    training: { timer: { running: false, startedAt: null, accumulatedMs: 0 }, revealed: {}, completed: {}, notes: '' },
    snapshots: [],
    run: null,
  })
}

/** A test browser: collects every message and can wait for one. */
export class Client {
  readonly messages: ServerMessage[] = []
  private waiters: Array<{ match: (message: ServerMessage) => boolean; resolve: (message: ServerMessage) => void }> = []
  readonly ws: WebSocket

  constructor(url: string) {
    this.ws = new WebSocket(url)
    this.ws.on('message', (data) => {
      const message = JSON.parse(String(data)) as ServerMessage
      this.messages.push(message)
      this.waiters = this.waiters.filter((waiter) => { if (!waiter.match(message)) return true; waiter.resolve(message); return false })
    })
  }

  opened() { return new Promise<void>((resolve, reject) => { this.ws.once('open', () => resolve()); this.ws.once('error', reject) }) }

  next<T extends ServerMessage['type']>(type: T, match: (message: Extract<ServerMessage, { type: T }>) => boolean = () => true): Promise<Extract<ServerMessage, { type: T }>> {
    const found = this.messages.find((message) => message.type === type && match(message as Extract<ServerMessage, { type: T }>))
    if (found) { this.messages.splice(this.messages.indexOf(found), 1); return Promise.resolve(found as Extract<ServerMessage, { type: T }>) }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No ${type} message`)), 3000)
      this.waiters.push({
        match: (message) => message.type === type && match(message as Extract<ServerMessage, { type: T }>),
        resolve: (message) => { clearTimeout(timer); this.messages.splice(this.messages.indexOf(message), 1); resolve(message as Extract<ServerMessage, { type: T }>) },
      })
    })
  }

  /** The next message of any of these types (for a join that may be answered by a state or by a refusal). */
  nextOf(types: ServerMessage['type'][]): Promise<ServerMessage> {
    const found = this.messages.find((message) => types.includes(message.type))
    if (found) { this.messages.splice(this.messages.indexOf(found), 1); return Promise.resolve(found) }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No ${types.join(' or ')} message`)), 3000)
      this.waiters.push({
        match: (message) => types.includes(message.type),
        resolve: (message) => { clearTimeout(timer); this.messages.splice(this.messages.indexOf(message), 1); resolve(message) },
      })
    })
  }

  closed() { return new Promise<number>((resolve) => { if (this.ws.readyState === this.ws.CLOSED) resolve(0); else this.ws.once('close', (code) => resolve(code)) }) }

  send(message: unknown) { this.ws.send(JSON.stringify(message)) }
  close() { this.ws.close() }
}

