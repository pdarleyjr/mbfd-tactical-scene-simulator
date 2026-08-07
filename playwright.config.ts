import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'tablet-chromium', use: { ...devices['iPad Pro 11'], browserName: 'chromium' } },
  ],
  webServer: {
    command: 'pnpm dev:e2e',
    url: 'http://127.0.0.1:5173/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
