import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'apps/**/*.test.tsx', 'packages/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'packages/collaboration/src/authorization.ts',
        'packages/collaboration/src/documents.ts',
        'packages/fire-model/src/*.ts',
        'apps/web/src/canvas/viewport.ts',
        'apps/web/src/scene/actions.ts',
        'apps/server/src/security/tokens.ts',
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
      exclude: ['**/*.d.ts', '**/index.ts'],
    },
  },
})
