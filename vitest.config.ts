import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'supabase/functions/**/*.test.ts', 'evals/**/*.test.ts'],
    exclude: ['.agents/**', 'docs/**', 'public/**'],
  },
})
