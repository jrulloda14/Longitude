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
  const evidence = process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-5b';
  await mkdir(`${evidence}/visual/after`, { recursive: true });
  const image = await page.screenshot({ path: `${evidence}/visual/after/${scenario.name}.png`, animations: 'disabled' });
  expect(image).toMatchSnapshot(['before', `${scenario.name}.png`], {
    threshold: .1, maxDiffPixels: 0,
  });
});
