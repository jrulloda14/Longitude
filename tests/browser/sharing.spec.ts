import { expect, test, type Page } from '@playwright/test';
import ICAL from 'ical.js';
import type { Options } from './fixture';
const now=Date.parse('2026-10-20T13:00:00Z');
async function open(page: Page, options: Options = {}) {
 await page.goto('/tests/browser/fixture.html');
 await page.evaluate(options=>window.longitudeTest.mount(options),{now,selected:now,sharing:'success' as const,...options});
 await page.getByRole('button',{name:'Share this time',exact:true}).click();
 return page.getByRole('dialog',{name:'Share meeting time'});
}
const event=(contents:string)=>new ICAL.Event(new ICAL.Component(ICAL.parse(contents)).getFirstSubcomponent('vevent')!);
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({page}) => { const errors: string[] = []; pageErrors.set(page, errors); page.on('pageerror', e => errors.push(e.message)); });
test.afterEach(({page}) => expect(pageErrors.get(page)).toEqual([]));
for(const [mode,label] of [['Full','Copy summary'],['One line','Copy line'],['Local times','Copy local times'],['UTC','Copy UTC']])test(`copy ${mode} equals the actual visible preview`,async({page})=>{
 const dialog=await open(page);await dialog.getByRole('radio',{name:mode,exact:true}).click();const text=await dialog.getByLabel('Summary preview').textContent();
 await dialog.getByRole('button',{name:label,exact:true}).click();expect(await page.evaluate(()=>window.longitudeSharing.copied.at(-1))).toBe(text);
 await expect(dialog.getByRole('status')).toHaveText('Copied selected text.');
});
test('full summary shows participant dates, offsets and entire-interval working compatibility',async({page})=>{
 const dialog=await open(page,{zones:['UTC','Asia/Kathmandu','Australia/Sydney'],durationMin:45,selected:Date.parse('2026-10-20T12:45Z'),work:{start:0,end:30,days:[3]},sleep:{start:0,end:0}});
 const preview=dialog.getByLabel('Summary preview');await expect(preview).toContainText('Tuesday, October 20, 2026 → Wednesday, October 21, 2026');
 await expect(preview).toContainText('UTC+5:45');await expect(preview).toContainText('Outside working hours');await expect(preview).toContainText('calendar availability is not checked');
});
for(const mode of ['copy-error','copy-throw'] as const)test(`${mode} gives visible feedback without an unhandled rejection`,async({page})=>{
 const dialog=await open(page,{sharing:mode});await dialog.getByRole('button',{name:'Copy summary',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText(/Clipboard|copy/i);expect(await page.evaluate(()=>window.longitudeSharing.copied)).toEqual([]);
});
for(const mode of ['save-error','save-throw'] as const)test(`${mode} reports filesystem failure distinctly`,async({page})=>{
 const dialog=await open(page,{sharing:mode});await dialog.getByRole('button',{name:'Export .ics',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('Disk full');
});
test('native cancellation is neutral and does not claim save success',async({page})=>{
 const dialog=await open(page,{sharing:'save-cancelled'});await dialog.getByRole('button',{name:'Export .ics',exact:true}).click();await expect(dialog.getByRole('status')).toHaveText('Save cancelled.');await expect(dialog.getByRole('alert')).toHaveCount(0);expect(await page.evaluate(()=>window.longitudeSharing.exported)).toEqual([]);
});
test('calendar session identity survives edits and closing, and explicit New event changes it',async({page})=>{
 const dialog=await open(page);const exportFile=async()=>{await dialog.getByRole('button',{name:/Export .ics|Saved/,exact:true}).click();return (await page.evaluate(()=>window.longitudeSharing.exported.at(-1)))!;};
 const first=event((await exportFile()).contents);await dialog.getByLabel('Meeting title').fill('Release; Review, 日本語 🙂');const edited=await exportFile();expect(event(edited.contents).uid).toBe(first.uid);expect(event(edited.contents).summary).toBe('Release; Review, 日本語 🙂');expect(edited.name).toBe('release-review.ics');
 await dialog.getByRole('switch',{name:'Repeat weekly'}).click();await dialog.getByLabel('Recurrence time basis').selectOption('reference');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Share this time',exact:true}).click();await expect(dialog.getByLabel('Recurrence time basis')).toHaveValue('reference');expect(event((await exportFile()).contents).uid).toBe(first.uid);
 await dialog.getByRole('button',{name:'New event',exact:true}).click();expect(event((await exportFile()).contents).uid).not.toBe(first.uid);await expect(dialog.getByLabel('Recurrence time basis')).toHaveValue('utc');
});
test('direct entry, timeline and suggestions feed the same summary/export instant while live ticks cannot reset planning',async({page})=>{
 await open(page,{realtime:true});await page.keyboard.press('Escape');await page.locator('#lg-time-input').fill('10:30 PM');await page.locator('#lg-time-input').press('Enter');
 const at=Date.parse('2026-10-20T14:30Z');
 await page.getByRole('button',{name:'Share this time',exact:true}).click();await page.getByRole('button',{name:'Export .ics',exact:true}).click();const data=await page.evaluate(()=>window.longitudeSharing.exported.at(-1));expect(event(data!.contents).startDate.toJSDate().getTime()).toBe(at);
 await page.waitForTimeout(1200);await expect(page.locator('.lg-dial').first()).toHaveAttribute('aria-valuenow','1350');
 await page.keyboard.press('Escape');await page.getByRole('radio',{name:'Planner',exact:true}).click();
 const timeline=page.getByRole('slider',{name:'Meeting start on the timeline'});await timeline.focus();await timeline.press('ArrowRight');
 const candidate=page.locator('button[title]').filter({hasText:/[0-9]+\/[0-9]+/}).first();
 await expect(candidate).toBeVisible();await candidate.click();
 const minute=Number(await timeline.getAttribute('aria-valuenow'));
 await page.getByRole('button',{name:'Share',exact:true}).click();await expect(page.getByLabel('Summary preview')).toBeVisible();
 await page.getByRole('button',{name:'Export .ics',exact:true}).click();
 const suggested=(await page.evaluate(()=>window.longitudeSharing.exported.at(-1)))!;
 expect(event(suggested.contents).startDate.toJSDate().getTime()).toBe(Date.parse('2026-10-19T16:00Z')+minute*60000);
});
test('explicit recurrence basis keeps preview and independently parsed export aligned across DST',async({page})=>{
 const dialog=await open(page,{zones:['America/New_York','Europe/London'],durationMin:90});await dialog.getByRole('switch',{name:'Repeat weekly'}).click();await expect(dialog.getByLabel('Summary preview')).toContainText('fixed UTC');
 await dialog.getByLabel('Recurrence time basis').selectOption('reference');await expect(dialog.getByLabel('Summary preview')).toContainText('fixed America/New_York wall time');
 await dialog.getByRole('button',{name:'Export .ics',exact:true}).click();const data=(await page.evaluate(()=>window.longitudeSharing.exported.at(-1)))!;
 const parsed=event(data.contents),iterator=parsed.iterator();const starts=[];for(let t=iterator.next();t;t=iterator.next())starts.push(t.toJSDate().getTime());expect(starts).toHaveLength(12);expect(new Date(starts[2]).toISOString()).toBe('2026-11-03T14:00:00.000Z');
});
test('custom duration stays exact and 90 minutes is not mislabeled as 1.5.5 hours',async({page})=>{
 const dialog=await open(page,{durationMin:37});await expect(dialog.getByLabel('Duration',{exact:true})).toHaveValue('37');await dialog.getByLabel('Duration',{exact:true}).selectOption('90');await expect(dialog.getByLabel('Duration',{exact:true}).locator('option:checked')).toHaveText('1.5 h');
});
for(const width of [380,850])test(`share sheet fits ${width}px and retains modal keyboard navigation`,async({page})=>{
 await page.setViewportSize({width,height:560});const dialog=await open(page);const box=(await dialog.boundingBox())!;expect(box.y+box.height).toBeLessThanOrEqual(560);expect(box.width).toBeLessThanOrEqual(width);
 await dialog.getByRole('button',{name:'Copy summary',exact:true}).focus();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'New event',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(dialog.getByRole('button',{name:'Export .ics',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(dialog.getByLabel('Meeting title')).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});
test('browser preview downloads an independently parsed UTC calendar and says download started',async({page})=>{
 await page.goto('/tests/browser/fixture.html');await page.evaluate(now=>window.longitudeTest.mount({now,selected:now}),now);await page.getByRole('button',{name:'Share this time',exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export .ics',exact:true}).click();const file=await download;expect(file.suggestedFilename()).toBe('weekly-sync.ics');const stream=(await file.createReadStream())!,chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(chunk);expect(event(Buffer.concat(chunks).toString('utf8')).startDate.toJSDate().getTime()).toBe(now);await expect(page.getByRole('status')).toHaveText('Calendar download started.');
});

test('outside-dial dragging and timeline keyboard selection reach the exported canonical instant',async({page})=>{
 await open(page,{zone:'UTC',zones:['UTC','Asia/Kathmandu']});await page.keyboard.press('Escape');
 const dial=page.locator('.lg-dial').first(),box=(await dial.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,r=box.width/2;
 await page.mouse.move(x,y-r*.8);await page.mouse.down();await page.mouse.move(x+r*1.2,y);await page.mouse.up();
 await page.getByRole('button',{name:'Share this time',exact:true}).click();await page.getByRole('button',{name:'Export .ics',exact:true}).click();
 expect(event((await page.evaluate(()=>window.longitudeSharing.exported.at(-1)))!.contents).startDate.toJSDate().getTime()).toBe(Date.parse('2026-10-20T13:15Z'));
 await page.keyboard.press('Escape');const timeline=page.getByRole('slider',{name:'Meeting start on the timeline'});await timeline.focus();await timeline.press('ArrowRight');
 await page.getByRole('button',{name:'Share this time',exact:true}).click();await page.getByRole('button',{name:'Export .ics',exact:true}).click();
 expect(event((await page.evaluate(()=>window.longitudeSharing.exported.at(-1)))!.contents).startDate.toJSDate().getTime()).toBe(Date.parse('2026-10-20T13:30Z'));
});
