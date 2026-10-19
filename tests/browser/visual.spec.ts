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
  const evidence = process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-6';
  await mkdir(`${evidence}/visual/after`, { recursive: true });
  const image = await page.screenshot({ path: `${evidence}/visual/after/${scenario.name}.png`, animations: 'disabled' });
  // M6 intentionally removes the misleading 'now' label from selected-date DST copy.
  // Keep immutable before/after evidence; only that reviewed note has a new expectation.
  const baseline = evidence.endsWith('milestone-6') && scenario.name === 'planner-dark' ? 'expected' : 'before';
  expect(image).toMatchSnapshot([baseline, `${scenario.name}.png`], {
    threshold: .1, maxDiffPixels: 0,
  });
});
