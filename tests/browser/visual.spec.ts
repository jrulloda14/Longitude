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
  await mkdir('docs/evidence/milestone-2/visual/after', { recursive: true });
  const image = await page.screenshot({ path: `docs/evidence/milestone-2/visual/after/${scenario.name}.png`, animations: 'disabled' });
  // The DST correction intentionally changes the timeline and day strips.
  // Its new golden is reviewed against before and backed by geometry tests.
  expect(image).toMatchSnapshot([scenario.name === 'london-fall' ? 'expected' : 'before', `${scenario.name}.png`], {
    threshold: .1, maxDiffPixels: 0,
  });
});
