import { mkdir } from 'node:fs/promises'
import { createApp } from './app.js'
import { createCollaborationServer } from './collaboration/server.js'
import { loadConfig } from './config.js'
import { runMigrations } from './db/migrate.js'
import { PostgresRepository } from './repository/postgres.js'

const config = loadConfig()
await mkdir(config.assetStoragePath, { recursive: true })
await runMigrations(config.databaseUrl, config.migrationsPath)

const repository = new PostgresRepository(config.databaseUrl)
const app = await createApp({
  repository,
  signingSecret: config.signingSecret,
  instructorPin: config.instructorPin,
  assetStoragePath: config.assetStoragePath,
  publicBaseUrl: config.publicBaseUrl,
  release: config.release,
})
const collaboration = createCollaborationServer({ repository, signingSecret: config.signingSecret, port: config.collabPort })

await collaboration.listen()
await app.listen({ port: config.port, host: '0.0.0.0' })

const shutdown = async () => {
  await collaboration.destroy()
  await app.close()
}

process.once('SIGTERM', () => { void shutdown() })
process.once('SIGINT', () => { void shutdown() })
