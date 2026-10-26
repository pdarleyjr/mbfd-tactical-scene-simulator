import { createSyncServer } from './server.js'

const port = Number(process.env.PORT ?? 8090)
const dataDir = process.env.DATA_DIR ?? process.argv[2] ?? './data/live'
const sync = createSyncServer({ dataDir })

sync.server.listen(port, () => console.log(`MBFD tactical sync listening on ${port}, data in ${dataDir}`))

async function shutdown(signal: string) {
  console.log(`${signal}: saving scenes`)
  await sync.close()
  process.exit(0)
}
process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })
