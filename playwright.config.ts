import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  reporter: 'list',
  outputDir: '/tmp/pulsete-playwright',
  use: {
    channel: 'chrome',
    viewport: { width: 1280, height: 900 },
    baseURL: 'http://127.0.0.1:18474',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev:web -- --host 127.0.0.1 --port 18474 --strictPort',
    url: 'http://127.0.0.1:18474/e2e/transcript/index.html',
  },
});
