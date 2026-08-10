import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const caddyfile = readFileSync(new URL('../../../Caddyfile', import.meta.url), 'utf8')

describe('production PWA cache policy', () => {
  it('never lets browsers or the CDN retain an obsolete service worker', () => {
    expect(caddyfile).toMatch(/@serviceWorker\s+path\s+\/sw\.js\s+\/workbox-\*\.js/)
    expect(caddyfile).toMatch(/header\s+@serviceWorker\s*{[^}]*Cache-Control\s+"no-store, no-cache, must-revalidate"/s)
    expect(caddyfile).toMatch(/header\s+@serviceWorker\s*{[^}]*CDN-Cache-Control\s+"no-store"/s)
  })

  it('revalidates application entry documents while retaining immutable hashed assets', () => {
    expect(caddyfile).toMatch(/@entryDocument\s+path\s+\/\s+\/index\.html\s+\/manifest\.webmanifest/)
    expect(caddyfile).toMatch(/header\s+@entryDocument\s*{[^}]*Cache-Control\s+"no-cache, must-revalidate"/s)
    expect(caddyfile).toMatch(/@immutableAssets\s+path\s+\/assets\/\*/)
    expect(caddyfile).toMatch(/header\s+@immutableAssets\s+Cache-Control\s+"public, max-age=31536000, immutable"/)
  })
})
