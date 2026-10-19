import { expect, test, type Page } from '@playwright/test';
import type { Options } from './fixture';
import { mkdir } from 'node:fs/promises';

const now = Date.parse('2026-10-20T13:00:00Z');
const minute = 60_000;
async function mount(page: Page, options: Options = {}, harness = false) {
  await page.goto('/tests/browser/fixture.html');
  await page.evaluate(({ options, harness }) => window.longitudeTest[harness ? 'mountClock' : 'mount'](options), { options, harness });
  await expect(page.locator('.lg-dial').first()).toBeVisible();
  if (harness) await expect(page.getByLabel('Authoritative selected instant')).toHaveText(String(options.selected ?? options.now ?? now));
}
const selected = (page: Page) => page.getByLabel('Authoritative selected instant');
async function point(page: Page, angle: number, radius = .8) {
  const box = (await page.locator('.lg-dial').boundingBox())!;
  return { x: box.x + box.width / 2 + Math.sin(angle * Math.PI / 180) * box.width / 2 * radius,
    y: box.y + box.height / 2 - Math.cos(angle * Math.PI / 180) * box.height / 2 * radius };
}
async function move(page: Page, angle: number, radius = .8) { const p = await point(page, angle, radius); await page.mouse.move(p.x, p.y); }

test.afterEach(async ({ page }) => {
  // Real browser errors fail their originating test, rather than being hidden
  // by successful DOM-only assertions.
  expect(await page.evaluate(() => (window as unknown as { errors?: string[] }).errors ?? [])).toEqual([]);
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { errors: string[] }).errors = [];
    window.addEventListener('error', e => (window as unknown as { errors: string[] }).errors.push(e.message));
    window.addEventListener('unhandledrejection', e => (window as unknown as { errors: string[] }).errors.push(String(e.reason)));
  });
});

test('all surfaces follow one selection and changing reference preserves the instant', async ({ page }) => {
  await mount(page);
  const dial = page.locator('.lg-dial');
  await dial.focus(); await page.keyboard.press('ArrowRight');
  await expect(page.locator('#lg-time-input')).toHaveValue('9:05');
  await expect(page.getByRole('listitem', { name: /^Manila,/ })).toHaveAttribute('aria-label', /9:05 PM/);
  await expect(page.getByRole('listitem', { name: /^New York,/ })).toHaveAttribute('aria-label', /9:05 AM/);
  await expect(page.getByRole('slider', { name: 'Meeting start on the timeline' })).toHaveAttribute('aria-valuetext', /9:05 PM/);
  await page.getByRole('listitem', { name: /^New York,/ }).press('Enter');
  await expect(page.locator('#lg-time-input')).toHaveValue('9:05');
  await expect(page.getByRole('button', { name: 'Switch to PM' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: /^Manila,/ })).toHaveAttribute('aria-label', /9:05 PM/);
  await expect(dial).toHaveAttribute('aria-valuetext', /America\/New_York UTC−4/);
});

test('planning time survives live ticks; Home returns to the current instant', async ({ page }) => {
  await page.clock.install({ time: new Date(now) });
  await page.clock.setFixedTime(new Date(now));
  await mount(page, { realtime: true });
  await page.locator('.lg-dial').press('ArrowRight');
  await expect(page.locator('#lg-time-input')).toHaveValue('9:05');
  await page.clock.setFixedTime(new Date(now + minute)); await page.clock.runFor(1100);
  await expect(page.locator('#lg-time-input')).toHaveValue('9:05');
  await expect(page.getByRole('button', { name: /Now · 9:01 PM/ })).toBeVisible();
  await page.locator('.lg-dial').press('Home');
  await expect(page.locator('#lg-time-input')).toHaveValue('9:01');
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
});

test('live time advances across local midnight without becoming a planning selection', async ({ page }) => {
  const midnight = Date.parse('2026-10-20T15:59:59Z');
  await page.clock.install({ time: new Date(midnight) }); await page.clock.setFixedTime(new Date(midnight));
  await mount(page, { realtime: true });
  await expect(page.locator('#lg-time-input')).toHaveValue('11:59');
  await page.clock.setFixedTime(new Date(midnight + 2000)); await page.clock.runFor(1100);
  await expect(page.locator('#lg-time-input')).toHaveValue('12:00');
  await expect(page.getByRole('listitem', { name: /^Manila,/ })).toHaveAttribute('aria-label', /Wed 21 Oct/);
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
});

test('minute-hand drag crosses midnight while captured outside the dial', async ({ page }) => {
  const at = Date.parse('2026-10-20T15:55Z');
  await mount(page, { selected: at }, true);
  await move(page, 330); await page.mouse.down();
  for (let angle = 335; angle <= 390; angle += 5) await move(page, angle, 1.2);
  expect(await page.locator('.lg-dial').evaluate(el => el.hasPointerCapture(1))).toBe(true);
  await page.mouse.up();
  await expect(selected(page)).toHaveText(String(at + 10 * minute));
  await expect(page.locator('.lg-dial')).toHaveAttribute('aria-valuetext', /12:05 AM, Wed 21 Oct/);
  await move(page, 100, 1.2);
  await expect(selected(page)).toHaveText(String(at + 10 * minute));
});

test('multiple revolutions and reverse midnight carry remain continuous', async ({ page }) => {
  await mount(page, { selected: now }, true);
  await move(page, 0); await page.mouse.down();
  for (let angle = 10; angle <= 720; angle += 10) await move(page, angle);
  await page.mouse.up();
  await expect(selected(page)).toHaveText(String(now + 120 * minute));
  const at = Date.parse('2026-10-20T16:05Z');
  await mount(page, { selected: at }, true);
  await move(page, 30); await page.mouse.down();
  for (let angle = 25; angle >= -30; angle -= 5) await move(page, angle);
  await page.mouse.up();
  await expect(selected(page)).toHaveText(String(at - 10 * minute));
});

test('hour-hand drag retains twelve-hour revolution scale', async ({ page }) => {
  await mount(page, { selected: now }, true); // Manila 21:00, hour hand at 270deg
  await move(page, 270, .45); await page.mouse.down();
  for (let angle = 280; angle <= 360; angle += 10) await move(page, angle, .45);
  await page.mouse.up();
  await expect(selected(page)).toHaveText(String(now + 180 * minute));
});

for (const event of ['pointercancel', 'lostpointercapture']) test(`${event} ends drag without a stuck capture`, async ({ page }) => {
  await mount(page, { selected: now }, true);
  await move(page, 0); await page.mouse.down(); await move(page, 60);
  await expect(selected(page)).toHaveText(String(now + 10 * minute));
  if (event === 'pointercancel') await page.locator('.lg-dial').dispatchEvent('pointercancel', { pointerId: 1 });
  else await page.locator('.lg-dial').evaluate(el => el.releasePointerCapture(1));
  await move(page, 120);
  await page.mouse.up();
  await expect(selected(page)).toHaveText(String(now + 10 * minute));
  expect(await page.locator('.lg-dial').evaluate(el => el.hasPointerCapture(1))).toBe(false);
});

test('dial click selects a snapped minute and double click resets', async ({ page }) => {
  await mount(page, { selected: now }, true);
  const p = await point(page, 90, .85); await page.mouse.click(p.x, p.y);
  await expect(selected(page)).toHaveText(String(now + 15 * minute));
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.getByLabel('Clock mode')).toHaveText('live');
});

for (const step of [1, 5] as const) test(`${step}-minute precision works for drag, wheel and keyboard`, async ({ page }) => {
  await mount(page, { selected: now, step }, true);
  await move(page, 0); await page.mouse.down(); await move(page, 36); await page.mouse.up();
  await expect(selected(page)).toHaveText(String(now + (step === 5 ? 5 : 6) * minute));
  await page.locator('.lg-dial').press('ArrowRight');
  await expect(selected(page)).toHaveText(String(now + (step === 5 ? 10 : 7) * minute));
  await page.locator('.lg-dial').press('Shift+ArrowRight');
  await expect(selected(page)).toHaveText(String(now + (step === 5 ? 11 : 8) * minute));
  await move(page, 180); await page.mouse.wheel(0, -80);
  await expect(selected(page)).toHaveText(String(now + (step === 5 ? 15 : 9) * minute));
});

test('wheel modifiers retain one-minute and one-hour alternatives', async ({ page }) => {
  await mount(page, { selected: now }, true); await move(page, 0);
  await page.keyboard.down('Shift'); await page.mouse.wheel(0, -80); await page.keyboard.up('Shift');
  await expect(selected(page)).toHaveText(String(now + minute));
  await page.keyboard.down('Alt'); await page.mouse.wheel(0, -80); await page.keyboard.up('Alt');
  await expect(selected(page)).toHaveText(String(now + 60 * minute));
});

for (const key of ['BracketRight', 'BracketLeft']) test(`day key ${key} preserves civil hour through DST`, async ({ page }) => {
  const at = Date.parse(key === 'BracketRight' ? '2026-03-28T12:00Z' : '2026-03-29T11:00Z');
  await mount(page, { zone: 'Europe/London', selected: at }, true);
  await page.locator('.lg-dial').press(key);
  await expect(selected(page)).toHaveText(String(Date.parse(key === 'BracketRight' ? '2026-03-29T11:00Z' : '2026-03-28T12:00Z')));
});

test('PageUp/PageDown and N retain keyboard time/reset alternatives', async ({ page }) => {
  await mount(page, { selected: now }, true);
  await page.locator('.lg-dial').press('PageUp'); await expect(selected(page)).toHaveText(String(now + 60 * minute));
  await page.locator('.lg-dial').press('PageDown'); await expect(selected(page)).toHaveText(String(now));
  await page.locator('.lg-dial').press('n'); await expect(page.getByLabel('Clock mode')).toHaveText('live');
});

test('date arrows preserve noon through DST and leap dates', async ({ page }) => {
  await mount(page, { zone: 'Europe/London', selected: Date.parse('2026-03-28T12:00Z') }, true);
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(selected(page)).toHaveText(String(Date.parse('2026-03-29T11:00Z')));
  await page.getByRole('button', { name: 'Previous day', exact: true }).click();
  await expect(selected(page)).toHaveText(String(Date.parse('2026-03-28T12:00Z')));
  await mount(page, { selected: Date.parse('2028-02-28T13:00Z') }, true);
  await page.getByRole('button', { name: 'Next day', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Choose planning date' })).toContainText('29 Feb');
});

test('direct entry validates, reverts with Escape and supports AM/PM keyboard selection', async ({ page }) => {
  await mount(page, {}, true);
  const input = page.locator('#lg-time-input');
  await input.fill('25:00'); await expect(input).toHaveValue('25:00'); await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('Hours must be 0–23');
  await input.press('Escape'); await expect(input).toHaveValue('9:00');
  await input.fill('2:31p'); await input.press('Enter');
  await expect(selected(page)).toHaveText(String(Date.parse('2026-10-20T06:31Z')));
  await page.getByRole('button', { name: 'Switch to AM' }).focus(); await page.keyboard.press('Enter');
  await expect(selected(page)).toHaveText(String(Date.parse('2026-10-19T18:31Z')));
  await page.getByRole('button', { name: 'Switch to PM' }).press('Space');
  await expect(selected(page)).toHaveText(String(Date.parse('2026-10-20T06:31Z')));
});

test('date entry is accessible, resolves a DST gap and restores focus on Escape', async ({ page }) => {
  await mount(page, { zone: 'America/New_York', selected: Date.parse('2027-03-13T07:30Z') }, true);
  const trigger = page.getByRole('button', { name: 'Choose planning date' });
  await trigger.press('Enter'); await page.locator('input[type="date"]').fill('2027-03-14');
  await page.getByRole('button', { name: 'Set date' }).click();
  await expect(selected(page)).toHaveText(String(Date.parse('2027-03-14T07:30Z')));
  await expect(page.getByRole('note')).toContainText('skip ahead 60 min');
  await trigger.press('Enter'); await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('ambiguous input offers both absolute occurrences and timeline distinguishes their offsets', async ({ page }) => {
  await mount(page, { zone: 'America/New_York', selected: Date.parse('2026-11-01T04:00Z') });
  await page.locator('#lg-time-input').fill('1:30a'); await page.locator('#lg-time-input').press('Enter');
  await expect(page.locator('.lg-dial')).toHaveAttribute('aria-valuetext', /UTC−4/);
  await page.getByRole('button', { name: /Use the second/ }).click();
  await expect(page.locator('.lg-dial')).toHaveAttribute('aria-valuetext', /UTC−5/);
  await expect(page.getByRole('slider', { name: 'Meeting start on the timeline' })).toHaveAttribute('aria-valuenow', '150');
});

test('timeline drag and keyboard update the clock and all participant readings', async ({ page }) => {
  await mount(page);
  const timeline = page.getByRole('slider', { name: 'Meeting start on the timeline' });
  const box = (await timeline.boundingBox())!;
  await page.mouse.move(box.x + box.width * .5, box.y + box.height / 2); await page.mouse.down(); await page.mouse.up();
  await expect(page.locator('#lg-time-input')).toHaveValue('11:45'); // click grabs meeting midpoint
  await expect(page.getByRole('listitem', { name: /^New York,/ })).toHaveAttribute('aria-label', /11:45 PM/);
  await timeline.press('ArrowRight'); await expect(page.locator('#lg-time-input')).toHaveValue('12:00');
  await timeline.press('Shift+ArrowRight'); await expect(page.locator('#lg-time-input')).toHaveValue('12:05');
});

test('DST timeline exposes 25 hours, repeated cells and correctly positioned noon', async ({ page }) => {
  await mount(page, { zone: 'Europe/London', selected: Date.parse('2026-10-25T12:30Z') });
  const timeline = page.getByRole('slider', { name: 'Meeting start on the timeline' });
  await expect(timeline).toHaveAttribute('aria-valuemax', '1499');
  await expect(page.locator('[data-zone="Europe/London"][data-cell-start]')).toHaveCount(25);
  await expect(page.locator('[data-zone="Europe/London"][title*=" 1:00 AM"]')).toHaveCount(2);
  await expect(page.getByText('Noon', { exact: true })).toHaveAttribute('style', /left: 52%/);
});

for (const zone of ['Asia/Kathmandu', 'Australia/Adelaide', 'Pacific/Chatham', 'Australia/Lord_Howe']) test(`${zone} stays synchronized on a fractional offset`, async ({ page }) => {
  // Chatham/Lord Howe are tested through the clock harness; the full city catalogue
  // maps the Chatham display label to its existing IANA entry.
  await mount(page, { zone, selected: now, step: 1 }, true);
  await page.locator('.lg-dial').press('ArrowRight');
  await expect(selected(page)).toHaveText(String(now + minute));
});

test('widget inherits planning selection and returns its preview to live only on explicit reset or timeout', async ({ page }) => {
  await page.clock.install({ time: new Date(now) });
  await mount(page, { selected: now + 5 * minute });
  await page.getByRole('button', { name: 'Compact widget', exact: true }).click();
  const widget = page.getByRole('region', { name: /compact clock/ });
  await expect(widget).toContainText('9:05');
  await widget.hover(); await page.mouse.wheel(0, -80);
  await expect(widget).toContainText('9:15');
  await page.getByRole('button', { name: 'Open full planner' }).click();
  await expect(page.locator('#lg-time-input')).toHaveValue('9:15');
  await page.getByRole('button', { name: 'Compact widget', exact: true }).click();
  await widget.focus(); await page.keyboard.press('Shift+ArrowRight');
  await expect(widget).toContainText('9:16');
  await page.clock.runFor(8100);
  await expect(widget).toContainText('Scroll to preview other times');
  await page.getByRole('button', { name: 'Open full planner' }).click();
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
});

test('share title focus survives live ticks and Tab remains inside the dialog', async ({ page }) => {
  await page.clock.install({ time: new Date(now) }); await page.clock.setFixedTime(new Date(now));
  await mount(page, { realtime: true });
  await page.getByRole('button', { name: 'Share this time' }).click();
  const title = page.getByRole('textbox', { name: 'Meeting title' });
  await title.fill('A live meeting');
  const duration = page.getByLabel('Duration', { exact: true }); await duration.focus();
  await page.clock.setFixedTime(new Date(now + minute)); await page.clock.runFor(1100);
  await expect(duration).toBeFocused(); await expect(title).toHaveValue('A live meeting');
  await page.keyboard.press('Shift+Tab'); await expect(title).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: 'Export .ics' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog', { name: 'Share meeting time' })).toHaveCount(0);
});

test('search input focus and result keyboard position survive live ticks', async ({ page }) => {
  await page.clock.install({ time: new Date(now) }); await page.clock.setFixedTime(new Date(now));
  await mount(page, { realtime: true });
  await page.getByRole('button', { name: 'Add location' }).click();
  const search = page.getByRole('combobox', { name: 'Search cities or time zones' });
  await search.fill('India'); await search.press('ArrowDown');
  const active = await search.getAttribute('aria-activedescendant');
  await page.clock.runFor(2100); await expect(search).toBeFocused();
  await expect(search).toHaveValue('India'); await expect(search).toHaveAttribute('aria-activedescendant', active!);
});

test('reduced motion keeps the dial keyboard-accessible without hand easing', async ({ page }) => {
  await mount(page, { selected: now, reducedMotion: 'on' }, true);
  await page.locator('.lg-dial').press('ArrowRight');
  await expect(page.locator('.lg-dial .lg-hand-anim')).toHaveCount(0);
  await expect(page.locator('.lg-dial')).toBeFocused();
  expect(await page.locator('.lg-dial').evaluate(el => getComputedStyle(el.querySelector('.lg-dial-focus')!).opacity)).toBe('1');
});

test('fractional DST timeline splits Lord Howe at 02:30 and typing a gap updates every row', async ({ page }) => {
  await mount(page, { zone: 'Australia/Lord_Howe', selected: Date.parse('2026-10-03T14:30Z') });
  await expect(page.getByRole('slider', { name: 'Meeting start on the timeline' })).toHaveAttribute('aria-valuemax', '1409');
  await expect(page.locator('[data-zone="Australia/Lord_Howe"][data-cell-start="1791041400000"]')).toHaveText('2:30');
  await page.locator('#lg-time-input').fill('2:15a'); await page.locator('#lg-time-input').press('Enter');
  await expect(page.getByRole('note')).toContainText('skip ahead 30 min');
  await expect(page.locator('#lg-time-input')).toHaveValue('2:45');
  await expect(page.getByRole('listitem', { name: /^New York,/ })).toHaveAttribute('aria-label', /11:45 AM/);
});

test('dragging through a fold keeps chronological movement and announces the changed offset', async ({ page }) => {
  const at = Date.parse('2026-10-25T00:55Z');
  await mount(page, { zone: 'Europe/London', selected: at }, true);
  await move(page, 330); await page.mouse.down();
  for (let angle = 335; angle <= 390; angle += 5) await move(page, angle);
  await page.mouse.up();
  await expect(selected(page)).toHaveText(String(at + 10 * minute));
  await expect(page.locator('.lg-dial')).toHaveAttribute('aria-valuetext', /1:05 AM.*UTC/);
  await page.locator('.lg-dial').press('ArrowLeft');
  await expect(selected(page)).toHaveText(String(at + 5 * minute));
});

test('row keyboard navigation/reorder work and child menu Enter does not change reference', async ({ page }) => {
  await mount(page);
  const manila = page.getByRole('listitem', { name: /^Manila,/ });
  const ny = page.getByRole('listitem', { name: /^New York,/ });
  await manila.focus(); await page.keyboard.press('ArrowDown'); await expect(ny).toBeFocused();
  await ny.press('Alt+ArrowUp');
  await expect(page.getByRole('listitem').first()).toHaveAttribute('aria-label', /^New York,/);
  await expect(ny).toBeFocused();
  await ny.getByRole('button', { name: 'More actions for New York' }).press('Enter');
  await expect(page.getByRole('menu', { name: 'New York actions' })).toBeVisible();
  await expect(page.locator('#lg-time-input')).toHaveValue('9:00');
  await expect(page.getByRole('button', { name: 'Switch to AM' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('groups menu opens and navigates using keyboard arrows', async ({ page }) => {
  await mount(page);
  await page.getByRole('button', { name: /My Team/ }).press('ArrowDown');
  await expect(page.getByRole('menuitemradio', { name: /My Team/ })).toBeFocused();
  await page.keyboard.press('ArrowDown'); await expect(page.getByRole('menuitem', { name: 'New group' })).toBeFocused();
  await page.keyboard.press('ArrowUp'); await expect(page.getByRole('menuitemradio', { name: /My Team/ })).toBeFocused();
});

test('24-hour direct entry stays controlled and keyboard can replace the whole focused input', async ({ page }) => {
  await mount(page, { hour12: false }, true);
  const input = page.locator('#lg-time-input');
  await expect(input).toHaveValue('21:00'); await input.focus();
  await page.keyboard.type('09:30'); await page.keyboard.press('Enter');
  await expect(input).toHaveValue('09:30');
  await expect(selected(page)).toHaveText(String(Date.parse('2026-10-20T01:30Z')));
  await expect(page.getByRole('button', { name: /Switch to/ })).toHaveCount(0);
  await mount(page, { hour12: false });
  await expect(page.getByText('6:00', { exact: true })).toBeVisible();
});

test('OS reduced-motion preference suppresses easing while planning survives input focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mount(page, { selected: now, reducedMotion: 'system' });
  const duration = await page.locator('.lg-dial .lg-hand').first().evaluate(el => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThanOrEqual(.001);
  await page.locator('#lg-time-input').focus(); await page.keyboard.press('Home');
  await expect(page.getByRole('button', { name: /Now ·/ })).toBeVisible();
});

test('mouse-focus direct entry replaces the old time and modal close restores the editable field', async ({ page }) => {
  await mount(page);
  const input = page.locator('#lg-time-input');
  await input.click(); await page.keyboard.type('10:17p'); await page.keyboard.press('Enter');
  await expect(input).toHaveValue('10:17');
  await input.focus(); await page.keyboard.press('Control+k');
  await expect(page.getByRole('combobox')).toBeFocused(); await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
  await page.keyboard.type('11:12p'); await page.keyboard.press('Enter');
  await expect(input).toHaveValue('11:12');
});

for (const viewport of [{ width: 380, height: 600 }, { width: 850, height: 560 }]) test(`date popup stays inside ${viewport.width}px window`, async ({ page }) => {
  await page.setViewportSize(viewport); await mount(page);
  await page.getByRole('button', { name: 'Choose planning date' }).click();
  const popup = page.getByRole('dialog', { name: 'Planning date' });
  await expect(page.locator('input[type="date"]')).toBeFocused();
  const box = (await popup.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width); expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  const evidence = process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-5b';
  await mkdir(`${evidence}/visual/after`, { recursive: true });
  await page.screenshot({ path: `${evidence}/visual/after/date-picker-${viewport.width}.png`, animations: 'disabled' });
});
