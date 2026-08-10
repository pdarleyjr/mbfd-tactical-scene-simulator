import { readFileSync } from 'node:fs'
import path from 'node:path'

function fromEnvironment(name: string, fallback?: string): string {
  const direct = process.env[name]
  if (direct) return direct.trim()
  const file = process.env[`${name}_FILE`]
  if (file) return readFileSync(file, 'utf8').trim()
  if (fallback !== undefined) return fallback
  throw new Error(`${name} or ${name}_FILE is required.`)
}

export interface ServerConfig {
  port: number
  collabPort: number
  databaseUrl: string
  signingSecret: string
  instructorPin: string
  publicBaseUrl: string
  assetStoragePath: string
  release: string
  migrationsPath: string
}

export function loadConfig(): ServerConfig {
  const port = Number(process.env.PORT ?? 3000)
  const collabPort = Number(process.env.COLLAB_PORT ?? 1234)
  if (!Number.isInteger(port) || !Number.isInteger(collabPort)) throw new Error('PORT and COLLAB_PORT must be integers.')
  const signingSecret = fromEnvironment('SESSION_SIGNING_SECRET', 'development-signing-secret-change-me')
  if (process.env.NODE_ENV === 'production' && signingSecret.length < 32) throw new Error('SESSION_SIGNING_SECRET must be at least 32 characters in production.')

  const databaseUrl = process.env.DATABASE_URL?.trim() || (() => {
    const password = encodeURIComponent(fromEnvironment('DATABASE_PASSWORD', 'firesim'))
    const user = encodeURIComponent(fromEnvironment('DATABASE_USER', 'firesim'))
    const host = fromEnvironment('DATABASE_HOST', '127.0.0.1')
    const database = encodeURIComponent(fromEnvironment('DATABASE_NAME', 'firesim'))
    const databasePort = Number(process.env.DATABASE_PORT ?? 5432)
    if (!Number.isInteger(databasePort)) throw new Error('DATABASE_PORT must be an integer.')
    return `postgresql://${user}:${password}@${host}:${databasePort}/${database}`
  })()

  return {
    port,
    collabPort,
    databaseUrl,
    signingSecret,
    instructorPin: fromEnvironment('INSTRUCTOR_PIN', '2300'),
    publicBaseUrl: fromEnvironment('PUBLIC_BASE_URL', `http://127.0.0.1:${port}`),
    assetStoragePath: path.resolve(fromEnvironment('ASSET_STORAGE_PATH', './data/assets')),
    release: fromEnvironment('APP_RELEASE', 'development'),
    migrationsPath: path.resolve(fromEnvironment('MIGRATIONS_PATH', './apps/server/drizzle')),
  }
}
