import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp } from './app.js'
import { createCollaborationServer } from './collaboration/server.js'
import { MemoryRepository } from './repository/memory.js'

const repository = new MemoryRepository()
const signingSecret = 'e2e-signing-secret-with-at-least-32-characters'
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const app = await createApp({ repository, signingSecret, instructorPin: '2300', assetStoragePath: path.join(repositoryRoot, 'data/assets'), publicBaseUrl: 'http://127.0.0.1:5173', enableRateLimit: false, release: 'e2e' })
const collaboration = createCollaborationServer({ repository, signingSecret, port: 1234 })
await collaboration.listen()
await app.listen({ port: 3000, host: '127.0.0.1' })

async function shutdown() { await collaboration.destroy(); await app.close() }
process.once('SIGTERM', () => { void shutdown() })
process.once('SIGINT', () => { void shutdown() })
