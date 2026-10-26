import { defineConfig } from '@playwright/test'

/** Screenshot captures for design review across classroom, desktop, tablet, and phone sizes. */
export default defineConfig({
  testDir: './tests/visual',
  timeout: 60_000,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium' },
  webServer: { command: 'pnpm dev:e2e', url: 'http://127.0.0.1:5173/', reuseExistingServer: true, timeout: 120_000 },
})
