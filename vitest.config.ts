import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'dist/**',
        'dist-electron/**',
        'dist-electron-build/**',
        'electron/**',
        'src/types/**',
        '**/*.d.ts',
      ],
      thresholds: {
        statements: 55,
        branches: 48,
        functions: 53,
        lines: 56,
        'src/components/**': {
          statements: 35,
          branches: 30,
          functions: 30,
          lines: 36,
        },
        'src/lib/{appFeedTransitions,featuredArticleLaunch,passageCapture,sessionTransitions,trainingFeedback,trainingRecall}.ts': {
          statements: 84,
          branches: 70,
          functions: 94,
          lines: 95,
        },
      },
    },
  },
})
