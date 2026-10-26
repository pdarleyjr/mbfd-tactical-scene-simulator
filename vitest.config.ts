import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['apps/**/*.test.ts', 'apps/**/*.test.tsx', 'packages/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'packages/domain/src/*.ts',
        'packages/fire-model/src/*.ts',
        'apps/web/src/canvas/viewport.ts',
        'apps/web/src/store/board.ts',
        'apps/web/src/lib/storage.ts',
        'apps/web/src/lib/scene-files.ts',
        'apps/web/src/lib/format.ts',
        'apps/web/src/lib/debrief.ts',
        'apps/sync/src/files.ts',
        'apps/sync/src/rooms.ts',
        'apps/sync/src/server.ts',
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
