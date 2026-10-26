import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'

/** Uploaded maps and videos, stored once and served to everyone by URL. */

const MEDIA_TYPES: Record<string, { ext: string; maxBytes: number }> = {
  'image/png': { ext: 'png', maxBytes: 40 * 1024 * 1024 },
  'image/jpeg': { ext: 'jpg', maxBytes: 40 * 1024 * 1024 },
  'image/webp': { ext: 'webp', maxBytes: 40 * 1024 * 1024 },
  // Cloudflare refuses request bodies over 100 MB, so videos stay under it.
  'video/mp4': { ext: 'mp4', maxBytes: 95 * 1024 * 1024 },
  'video/webm': { ext: 'webm', maxBytes: 95 * 1024 * 1024 },
}
const CONTENT_TYPES = Object.fromEntries(Object.entries(MEDIA_TYPES).map(([type, info]) => [info.ext, type]))
const NAME = /^[0-9a-f-]{36}\.(png|jpg|webp|mp4|webm)$/

export function json(response: ServerResponse, status: number, body: unknown) {
  if (response.headersSent) return
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
  response.end(JSON.stringify(body))
}

class TooLarge extends Error {}

export class MediaStore {
  /** Bytes being written right now, so concurrent uploads cannot overrun the quota together. */
  private reserved = 0

  constructor(private readonly dir: string, private readonly maxTotalBytes: number) {}

  async usage(): Promise<number> {
    try {
      let total = 0
      for (const file of await readdir(this.dir)) if (NAME.test(file)) total += (await stat(path.join(this.dir, file))).size
      return total
    } catch { return 0 }
  }

  async upload(request: IncomingMessage, response: ServerResponse) {
    const type = String(request.headers['content-type'] ?? '').split(';')[0]!.trim()
    const rule = MEDIA_TYPES[type]
    if (!rule) return json(response, 415, { error: 'Upload a PNG, JPEG, or WebP image, or an MP4 or WebM video.' })
    const declared = Number(request.headers['content-length'] ?? 0)
    if (declared > rule.maxBytes) return json(response, 413, { error: 'That file is too large.' })
    const room = this.maxTotalBytes - (await this.usage()) - this.reserved
    const limit = Math.min(rule.maxBytes, room)
    if (limit <= 0 || declared > room) return json(response, 507, { error: 'The server is out of space for uploads.' })

    await mkdir(this.dir, { recursive: true })
    const name = `${randomUUID()}.${rule.ext}`
    const temporary = path.join(this.dir, `${name}.part`)
    let received = 0
    this.reserved += limit
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        received += chunk.length
        done(received > limit ? new TooLarge() : null, chunk)
      },
    })
    try {
      await pipeline(request, counter, createWriteStream(temporary))
      if (received === 0) { await rm(temporary, { force: true }); return json(response, 400, { error: 'That file is empty.' }) }
      await rename(temporary, path.join(this.dir, name))
      json(response, 201, { url: `/media/${name}`, bytes: received })
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      if (error instanceof TooLarge) {
        response.setHeader('Connection', 'close')
        json(response, received > rule.maxBytes ? 413 : 507, { error: received > rule.maxBytes ? 'That file is too large.' : 'The server is out of space for uploads.' })
      } else if (!request.destroyed) {
        console.error('Upload failed', error)
        json(response, 500, { error: 'Upload failed.' })
      }
    } finally {
      this.reserved -= limit
    }
  }

  async serve(request: IncomingMessage, response: ServerResponse, name: string) {
    if (!NAME.test(name)) return json(response, 404, { error: 'Not found' })
    const file = path.join(this.dir, name)
    let size: number
    try { size = (await stat(file)).size } catch { return json(response, 404, { error: 'Not found' }) }
    const headers = {
      'Content-Type': CONTENT_TYPES[name.split('.').pop()!] ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    }
    let start = 0
    let end = size - 1
    const range = /^bytes=(\d*)-(\d*)$/.exec(String(request.headers.range ?? ''))
    if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
      end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      if (start > end || start >= size) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return }
      response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 })
    } else {
      response.writeHead(200, { ...headers, 'Content-Length': size })
    }
    // A viewer seeking a video closes the request early; pipeline then closes the file too.
    await pipeline(createReadStream(file, { start, end }), response).catch(() => undefined)
  }
}
