import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    // Keep jsdom workers within the hosted runner's CPU and memory budget.
    fileParallelism: !process.env.CI,
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
