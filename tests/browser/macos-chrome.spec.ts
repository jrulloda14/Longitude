import { test, expect } from '@playwright/test';

// Shared component tests only. This does not emulate AppKit traffic lights,
// native focus, Spaces, or actual macOS title-bar hit testing.
test('native Mac chrome reserves traffic-light space without duplicate HTML controls', async ({ page }) => {
  await page.goto('/tests/browser/fixture.html');
  await page.evaluate(() => window.longitudeTest.mountChrome());
  await expect(page.getByRole('button', { name: 'Compact widget' })).toBeVisible();
  for (const name of ['Close', 'Minimize', 'Zoom']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
  const inset = page.locator('header > [aria-hidden="true"]');
  await expect(inset).toHaveAttribute('data-tauri-drag-region', 'true');
  expect((await inset.boundingBox())!.width).toBe(80);
  await page.getByRole('button', { name: 'Compact widget' }).focus();
  await expect(page.getByRole('button', { name: 'Compact widget' })).toBeFocused();
});

test('browser Mac preview retains the original traffic-light interactions', async ({ page }) => {
  await page.goto('/tests/browser/fixture.html');
  await page.evaluate(() => window.longitudeTest.mountChrome(false));
  for (const name of ['Close', 'Minimize', 'Zoom']) await expect(page.getByRole('button', { name, exact: true })).toBeVisible();
});
