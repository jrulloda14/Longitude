import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { scenarios } from '../tests/browser/scenarios.mjs';
const phase = process.argv[2];
if (!['before', 'after'].includes(phase)) throw new Error('Specify before or after');
const milestone = process.argv[3] ?? 'milestone-2';
if (!/^milestone-[2346]$/.test(milestone)) throw new Error('Unsupported milestone');
const directory = `docs/evidence/${milestone}/visual/${phase}`;
await mkdir(directory, { recursive: true });
await build({ configFile: 'tests/browser/vite.config.ts' });
const server = await preview({ configFile: 'tests/browser/vite.config.ts' });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];
try {
  for (const scenario of scenarios) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: scenario.height }, deviceScaleFactor: 1, timezoneId: 'Asia/Singapore' });
    page.on('pageerror', error => errors.push(`${scenario.name}: ${error.message}`));
    await page.goto('http://127.0.0.1:4175/tests/browser/fixture.html');
    await page.evaluate(options => window.longitudeTest.mount(options), scenario.options);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    await page.mouse.move(-1, -1);
    await page.screenshot({ path: `${directory}/${scenario.name}.png`, animations: 'disabled' });
    await page.close();
  }
  if (milestone === 'milestone-6') {
    for (const width of [850, 380]) {
      const page = await browser.newPage({ viewport: { width, height: width === 380 ? 700 : 560 }, timezoneId: 'Asia/Singapore' });
      await page.goto('http://127.0.0.1:4175/tests/browser/fixture.html');
      await page.evaluate(() => window.longitudeTest.mount({ now: Date.parse('2026-10-20T13:00Z'), selected: Date.parse('2026-10-20T13:00Z') }));
      await page.getByRole('button', { name: 'Share this time', exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${directory}/share-${width}.png`, animations: 'disabled' });
      await page.close();
    }
  }
  await writeFile(`${directory}/metadata.json`, JSON.stringify({ browser: browser.version(), phase, scenarios, errors }, null, 2) + '\n');
  console.log(`Captured ${scenarios.length} ${phase} screenshots; ${errors.length} page errors`);
  if (errors.length) throw new Error(errors.join('\n'));
} finally { await browser.close(); await new Promise(resolve => server.httpServer.close(resolve)); }
