import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import type { Options } from './fixture';
import { scenarios } from './scenarios.mjs';

for (const scenario of scenarios) test(`visual ${scenario.name}`, async ({ page }) => {
  await page.setViewportSize({ width: scenario.width, height: scenario.height });
  await page.goto('/tests/browser/fixture.html');
  await page.evaluate(options => window.longitudeTest.mount(options), scenario.options as Options);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  await page.mouse.move(-1, -1);
  await mkdir('docs/evidence/milestone-3/visual/after', { recursive: true });
  const image = await page.screenshot({ path: `docs/evidence/milestone-3/visual/after/${scenario.name}.png`, animations: 'disabled' });
  // Reviewed corrections: exact sub-hour band colors; planner controls/ranking.
  const corrected = ['clock-dark', 'clock-light', 'clock-planning', 'planner-dark', 'kathmandu'].includes(scenario.name);
  expect(image).toMatchSnapshot([corrected ? 'expected' : 'before', `${scenario.name}.png`], {
    threshold: .1, maxDiffPixels: 0,
  });
});
