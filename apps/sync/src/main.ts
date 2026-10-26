import { createSyncServer } from './server.js'

const port = Number(process.env.PORT ?? 8090)
const dataDir = process.env.DATA_DIR ?? process.argv[2] ?? './data/live'
const sync = createSyncServer({ dataDir })

sync.server.listen(port, () => console.log(`MBFD tactical sync listening on ${port}, data in ${dataDir}`))

let stopping = false
async function shutdown(signal: string, code = 0) {
  if (stopping) return
  stopping = true
  console.log(`${signal}: saving scenes`)
  try { await sync.close() } catch (error) { console.error('Saving on shutdown failed', error) }
  process.exit(code)
}
process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT', () => { void shutdown('SIGINT') })
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection', reason))
// Unknown state after an uncaught exception: save what is in memory, then let Docker restart the service.
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception', error)
  void shutdown('uncaughtException', 1)
})
