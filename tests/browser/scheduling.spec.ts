import { test, expect, type Page } from '@playwright/test';
import type { Options } from './fixture';
import { mkdir } from 'node:fs/promises';
const stamp = (s: string) => Date.parse(s);
async function mount(page: Page, options: Options = {}) {
  await page.goto('/tests/browser/fixture.html');
  await page.evaluate(options => window.longitudeTest.mount(options), options);
  await expect(options.view === 'settings' ? page.getByLabel('Default start', { exact: true }) : page.locator('.lg-dial').first()).toBeVisible();
}
async function edit(page: Page) {
  await page.getByRole('button', { name: /More actions for/ }).first().click();
  await page.getByRole('menuitem', { name: 'Working hours…' }).click();
  return page.getByRole('dialog', { name: /Working hours —/ });
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { failures: string[] }).failures = []; window.addEventListener('error', e => (window as unknown as { failures: string[] }).failures.push(e.message)); });
});
test.afterEach(async ({ page }) => expect(await page.evaluate(() => (window as unknown as { failures: string[] }).failures)).toEqual([]));

test('overnight Friday ownership is reflected in the actual row and overlap indicator on Saturday', async ({ page }) => {
  await mount(page, { zone: 'UTC', zones: ['UTC'], selected: stamp('2026-10-24T02:00Z'), work: { start: 1320, end: 360, days: [5] }, sleep: { start: 0, end: 0 } });
  await expect(page.getByRole('listitem').first()).toHaveAttribute('aria-label', /Working hours/);
  await expect(page.getByRole('button', { name: /Good overlap/ })).toBeVisible();
});
test('full meeting duration changes suitability when only the final minutes cross work end', async ({ page }) => {
  await mount(page, { zone: 'UTC', zones: ['UTC'], view: 'planner', selected: stamp('2026-10-20T16:50Z'), work: { start: 540, end: 1020, days: [2] }, sleep: { start: 0, end: 0 }, durationMin: 5 });
  await expect(page.getByRole('button', { name: /Good overlap/ })).toBeVisible();
  await page.getByLabel('Duration', { exact: true }).selectOption('15');
  await expect(page.getByRole('button', { name: /Poor overlap/ })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Just outside working hours' })).toHaveAttribute('title', /10.0 min within working hours/);
});
test('working editor saves split overnight intervals, supports days off and validates equal endpoints', async ({ page }) => {
  await mount(page, { zone: 'UTC', zones: ['UTC'], selected: stamp('2026-10-24T02:00Z'), work: { start: 540, end: 1020, days: [5] }, sleep: { start: 0, end: 0 } });
  const dialog = await edit(page);
  await dialog.getByLabel('Work starts', { exact: true }).selectOption('1320');
  await dialog.getByLabel('Work ends', { exact: true }).selectOption('1320');
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await dialog.getByLabel('Work ends', { exact: true }).selectOption('360');
  await dialog.getByRole('button', { name: 'Add work interval' }).click();
  await dialog.getByLabel('Work 2 starts', { exact: true }).selectOption('780');
  await dialog.getByLabel('Work 2 ends', { exact: true }).selectOption('900');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: /Good overlap/ })).toBeVisible();
  const again = await edit(page); await expect(again.getByLabel('Work 2 starts', { exact: true })).toHaveValue('780');
  await again.getByRole('button', { name: 'Friday', exact: true }).click();
  await expect(again.getByText(/No working days selected/)).toBeVisible();
  await again.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: /Poor overlap/ })).toBeVisible();
});
test('sleep conflicts are explained and eight-interval editor stays scrollable', async ({ page }) => {
  await mount(page);
  const dialog = await edit(page);
  await dialog.getByLabel('Work starts', { exact: true }).selectOption('1320'); await dialog.getByLabel('Work ends', { exact: true }).selectOption('360');
  await expect(dialog.getByText(/Sleeping hours take priority/)).toBeVisible();
  for (let i = 1; i < 8; i++) await dialog.getByRole('button', { name: 'Add work interval' }).click();
  await expect(dialog.getByRole('button', { name: 'Add work interval' })).toBeDisabled();
  await dialog.getByRole('button', { name: 'Save', exact: true }).scrollIntoViewIfNeeded();
  const box = (await dialog.boundingBox())!; expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(560);
  await dialog.getByRole('button', { name: 'Remove work interval 8' }).click();
  await expect(dialog.getByRole('button', { name: 'Add work interval' })).toBeEnabled();
});
test('custom duration, subset, date range, preference, minimum overlap and fairness drive real results', async ({ page }) => {
  await mount(page, { view: 'planner' });
  await page.getByLabel('Duration', { exact: true }).selectOption('custom'); await page.getByLabel('Custom duration minutes').fill('47');
  await page.getByRole('button', { name: 'Search options', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Recommendation search' });
  await dialog.getByLabel('Search from date').fill('2026-10-20'); await dialog.getByLabel('Search through date').fill('2026-10-22');
  for (const name of ['New York', 'London', 'Sydney']) await dialog.getByLabel(name, { exact: true }).uncheck();
  await dialog.getByLabel(/Require entire meeting/).check();
  await dialog.getByLabel('Preferred starts', { exact: true }).selectOption('540'); await dialog.getByLabel('Preferred ends', { exact: true }).selectOption('1020');
  await dialog.getByLabel('Minimum fully working locations').fill('1'); await dialog.getByLabel('Minimum shared working minutes').fill('47');
  await dialog.getByLabel(/Balance the worst/).check();
  await mkdir('docs/evidence/milestone-3/visual/after', { recursive: true });
  await page.screenshot({ path: 'docs/evidence/milestone-3/visual/after/search-controls.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const recommendations = page.getByRole('button', { name: /within working hours for the full 47 min/ });
  await expect(recommendations).toHaveCount(3); await expect(recommendations.first()).toHaveAttribute('title', /47 min shared working time/);
  await page.getByRole('button', { name: 'Why these times' }).click();
  await expect(page.getByRole('list', { name: 'Recommendation reasons' })).toContainText('Fairness:');
  await recommendations.first().click(); await expect(page.getByText('Now', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click(); await expect(page.getByRole('button', { name: 'Clear filters' })).not.toBeVisible();
});
test('search validates ranges and empty subsets without fabricating recommendations', async ({ page }) => {
  await mount(page, { view: 'planner' }); await page.getByRole('button', { name: 'Search options' }).click();
  const dialog = page.getByRole('dialog', { name: 'Recommendation search' });
  await dialog.getByLabel('Search through date').fill('2026-12-20'); await dialog.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText(/at most 31/);
  await dialog.getByLabel('Search through date').fill('2026-10-20');
  for (const name of ['Manila', 'New York', 'London', 'Sydney']) await dialog.getByLabel(name, { exact: true }).uncheck();
  await dialog.getByRole('button', { name: 'Search', exact: true }).click(); await expect(dialog.getByRole('alert')).toHaveText(/at least one/);
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Search options' })).toBeFocused();
});
test('no feasible minimum returns explicit empty state and filters survive live ticks', async ({ page }) => {
  const now = stamp('2026-10-20T13:00Z'); await page.clock.install({ time: new Date(now) });
  await mount(page, { view: 'planner', realtime: true }); await page.getByRole('button', { name: 'Search options' }).click();
  const dialog = page.getByRole('dialog', { name: 'Recommendation search' });
  await dialog.getByLabel('Minimum fully working locations').fill('4'); await dialog.getByLabel('Minimum shared working minutes').fill('30');
  await dialog.getByRole('button', { name: 'Search', exact: true }).click(); await expect(page.getByText('No times meet these filters.')).toBeVisible();
  await page.clock.runFor(2100); await expect(page.getByText('No times meet these filters.')).toBeVisible();
});
test('invalid default hours never enter application state', async ({ page }) => {
  await mount(page, { view: 'settings' }); await page.getByLabel('Default start', { exact: true }).selectOption('1050');
  await expect(page.getByRole('alert')).toHaveText(/Defaults are unchanged until valid/);
  await page.getByLabel('Default end', { exact: true }).selectOption('1080'); await expect(page.getByRole('alert')).not.toBeVisible();
});
test('fractional DST full-duration verdict reflects the repeated working interval gap', async ({ page }) => {
  await mount(page, { zones: ['Australia/Lord_Howe'], zone: 'Australia/Lord_Howe', view: 'planner', selected: stamp('2026-04-04T14:45Z'), work: { start: 105, end: 115, days: [0] }, sleep: { start: 0, end: 0 }, durationMin: 30 });
  await expect(page.getByRole('button', { name: /Poor overlap/ })).toBeVisible();
  await expect(page.getByRole('listitem').first()).toHaveAttribute('title', /10.0 min within working hours/);
});
for (const width of [380, 850]) test(`search dialog fits ${width}px and keeps keyboard focus`, async ({ page }) => {
  await page.setViewportSize({ width, height: 600 }); await mount(page, { view: 'planner' }); await page.getByRole('button', { name: 'Search options' }).click();
  const dialog = page.getByRole('dialog', { name: 'Recommendation search' });
  await dialog.getByRole('button', { name: 'Search', exact: true }).scrollIntoViewIfNeeded();
  const box = (await dialog.boundingBox())!; expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(600);
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Search options' })).toBeFocused();
});

test('timeline and day strip retain exact sub-hour work boundaries', async ({ page }) => {
  const start = stamp('2026-10-20T09:07Z'), end = stamp('2026-10-20T09:23Z');
  await mount(page, { zone: 'UTC', zones: ['UTC'], selected: start, work: { start: 547, end: 563, days: [2] }, sleep: { start: 0, end: 0 }, durationMin: 5 });
  await expect(page.locator(`[data-strip-state="work"][data-range-start="${start}"]`)).toHaveAttribute('data-range-end', String(end));
  const cell = page.locator(`[data-zone="UTC"][data-cell-start="${stamp('2026-10-20T09:00Z')}"]`);
  await expect(cell).toHaveAttribute('style', /linear-gradient/);
  await expect(page.getByRole('button', { name: /Good overlap/ })).toBeVisible();
});
