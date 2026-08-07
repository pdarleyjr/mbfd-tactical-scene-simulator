import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import { loadConfig } from '../config.js'

export async function runMigrations(connectionString: string, migrationsPath: string): Promise<void> {
  const pool = new Pool({ connectionString, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: migrationsPath })
  } finally {
    await pool.end()
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
  const config = loadConfig()
  await runMigrations(config.databaseUrl, config.migrationsPath)
}
