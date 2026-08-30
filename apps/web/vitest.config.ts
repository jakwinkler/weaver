import { mergeConfig } from 'vite';
import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
      include: ['src/**/*.test.{ts,tsx}'],
      passWithNoTests: true,
    },
  }),
);
