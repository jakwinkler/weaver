import { defineConfig } from '@playwright/test';

// Deliberately separate from the local write suite. No automatic retry can
// create another live organization. Prepare/cleanup use the reviewed manifest.
export default defineConfig({
  testDir: './acceptance',
  testMatch: 'live-client.spec.ts',
  timeout: 600_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: process.env.WEAVER_ACCEPTANCE_OUTPUT || '/tmp/weaver-live-client-results',
  use: {
    baseURL: 'https://weaver.usercore.com',
    viewport: { width: 1920, height: 1080 },
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
