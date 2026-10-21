import { defineConfig } from '@playwright/test';
const evidence = process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-6';
const webkit = process.env.LONGITUDE_BROWSER === 'webkit';
// Edge goldens are recorded on the reference Windows host; hosted CI runners
// render fonts differently, so CI opts out with LONGITUDE_SKIP_GOLDENS=1.
const skipGoldens = webkit || process.env.LONGITUDE_SKIP_GOLDENS === '1';
export default defineConfig({
  testDir: './tests/browser', testMatch: '**/*.spec.ts', workers: 1, retries: 0,
  timeout: 30_000, expect: { timeout: 5000 },
  // Edge goldens are not valid WebKit/macOS screenshot baselines.
  testIgnore: skipGoldens ? ['**/visual.spec.ts'] : [],
  snapshotPathTemplate: `{testDir}/../../${evidence}/visual/{arg}{ext}`,
  reporter: [['list'], ['json', { outputFile: `${evidence}/browser-results.json` }]],
  use: { browserName: webkit ? 'webkit' : 'chromium', channel: !webkit && process.platform === 'win32' ? 'msedge' : undefined, headless: true, viewport: { width: 850, height: 560 }, timezoneId: 'Asia/Singapore',
    baseURL: 'http://127.0.0.1:4175', trace: 'retain-on-failure' },
  webServer: { command: 'npx vite build --config tests/browser/vite.config.ts && npx vite preview --config tests/browser/vite.config.ts',
    url: 'http://127.0.0.1:4175/tests/browser/fixture.html', reuseExistingServer: false },
});
