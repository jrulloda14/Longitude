import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', testMatch: '**/*.spec.ts', workers: 1, retries: 0,
  timeout: 30_000, expect: { timeout: 5000 },
  snapshotPathTemplate: '{testDir}/../../docs/evidence/milestone-3/visual/{arg}{ext}',
  reporter: [['list'], ['json', { outputFile: 'docs/evidence/milestone-3/browser-results.json' }]],
  use: { channel: 'msedge', headless: true, viewport: { width: 850, height: 560 }, timezoneId: 'Asia/Singapore',
    baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  webServer: { command: 'npx vite build --config tests/browser/vite.config.ts && npx vite preview --config tests/browser/vite.config.ts',
    url: 'http://127.0.0.1:4175/tests/browser/fixture.html', reuseExistingServer: false },
});
