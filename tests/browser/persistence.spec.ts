import { expect, test, type Page } from '@playwright/test';
import type { Options } from './fixture';
const key='longitude.configuration';
async function open(page:Page,options:Options={persist:true}){await page.goto('/tests/browser/fixture.html');await page.evaluate(o=>{window.longitudeTest.mount(o);history.replaceState(null,'','?persist=1');},options);await expect(page.locator('.lg-dial').first()).toBeVisible();}
async function data(page:Page){return page.evaluate(k=>{try{const raw=localStorage.getItem(k);return raw?JSON.parse(JSON.parse(raw).current).data:null;}catch{return null;}},key);}
async function waitSaved(page:Page){await expect.poll(()=>data(page)).not.toBeNull();}
async function seed(page:Page,raw:string){await page.goto('/tests/browser/fixture.html');await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key,raw});}
async function edit(page:Page){await page.getByRole('button',{name:/More actions for/}).first().click();await page.getByRole('menuitem',{name:'Working hours…'}).click();return page.getByRole('dialog',{name:/Working hours —/});}
test.beforeEach(async({page})=>{await page.addInitScript(()=>{(window as unknown as {errors:string[]}).errors=[];window.addEventListener('error',e=>(window as unknown as {errors:string[]}).errors.push(e.message));});});
test.afterEach(async({page})=>expect(await page.evaluate(()=>(window as unknown as {errors:string[]}).errors)).toEqual([]));

test('theme, time format and precision survive reload; live/session state does not',async({page})=>{
 await open(page);await waitSaved(page);await page.getByRole('radio',{name:'Settings',exact:true}).click();
 await page.getByRole('radio',{name:'Light',exact:true}).click();await page.getByRole('radio',{name:'24-hour',exact:true}).click();await page.getByRole('radio',{name:'1 min',exact:true}).click();
 await expect.poll(async()=>JSON.stringify((await data(page))?.settings)).toContain('"theme":"light"');
 await page.getByRole('radio',{name:'Clock',exact:true}).click();await page.locator('.lg-dial').press('ArrowRight');
 await expect(page.getByRole('button',{name:/Now ·/})).toBeVisible();await page.reload();await expect(page.locator('.lg-dial')).toHaveAttribute('aria-valuetext',/now/);
 await expect(page.locator('[data-theme]').first()).toHaveAttribute('data-theme','light');const saved=await data(page);expect(saved.settings.hour12).toBe(false);expect(saved.settings.step).toBe(1);expect(saved.selected).toBeUndefined();expect(saved.mode).toBeUndefined();expect(saved.view).toBeUndefined();
});
test('saved labels, split/overnight shifts, sleep, favorites, ordering and reference survive reload',async({page})=>{
 await open(page);const dialog=await edit(page);await dialog.getByLabel('Label (optional)').fill('Design lead');await dialog.getByLabel('Work starts',{exact:true}).selectOption('1320');await dialog.getByLabel('Work ends',{exact:true}).selectOption('360');await dialog.getByRole('button',{name:'Add work interval'}).click();await dialog.getByLabel('Sleep starts',{exact:true}).selectOption('480');await dialog.getByLabel('Sleep ends',{exact:true}).selectOption('960');await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await page.getByRole('button',{name:/More actions for Manila/}).click();await page.getByRole('menuitem',{name:'Remove from favorites'}).click();
 await page.getByRole('listitem',{name:/^Manila,/}).press('Alt+ArrowDown');await page.getByRole('listitem',{name:/^New York,/}).press('Enter');
 await expect.poll(async()=>JSON.stringify((await data(page))?.groups[0])).toContain('Design lead');await page.waitForTimeout(350);const before=await data(page);await page.reload();await expect(page.locator('.lg-dial')).toHaveAttribute('aria-valuetext',/America\/New_York/);expect(await data(page)).toEqual(before);
 const d=await data(page),loc=d.groups[0].locations.find((l:{name:string})=>l.name==='Manila');expect(loc.favorite).toBe(false);expect(loc.work.intervals).toHaveLength(2);expect(loc.sleep).toEqual({start:480,end:960});expect(d.groups[0].locations[0].name).toBe('New York');
});
test('create, rename, duplicate and active-group selection persist',async({page})=>{
 await open(page);await page.locator('button[aria-haspopup=menu]').first().click();await page.getByRole('menuitem',{name:'New group'}).click();await page.getByLabel('New group name').fill('Night team');await page.getByLabel('New group name').press('Enter');
 await expect.poll(async()=>(await data(page))?.groups.length).toBe(2);await page.reload();await expect(page.locator('button[aria-haspopup=menu]').first()).toContainText('Night team');
 await page.locator('button[aria-haspopup=menu]').first().click();const row=page.getByRole('menuitemradio',{name:/Night team/}).locator('..');await row.hover();await row.getByRole('button',{name:'Rename Night team',exact:true}).click();await page.getByLabel('Group name',{exact:true}).fill('Saved night team');await page.getByLabel('Group name',{exact:true}).press('Enter');
 await expect.poll(async()=>JSON.stringify((await data(page))?.groups)).toContain('Saved night team');
 await page.getByRole('button',{name:'Duplicate Saved night team',exact:true}).click();await expect.poll(async()=>(await data(page))?.groups.length).toBe(3);await page.reload();await expect(page.locator('button[aria-haspopup=menu]').first()).toContainText('Saved night team copy');
});
test('asynchronous hydration never writes defaults over existing preferences',async({page})=>{
 await open(page);await waitSaved(page);await page.getByRole('radio',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'Light',exact:true}).click();await expect.poll(async()=>(await data(page))?.settings.theme).toBe('light');const original=await page.evaluate(k=>localStorage.getItem(k),key);
 await page.evaluate(()=>window.longitudeTest.mount({persist:true,storageDelay:400}));await expect(page.getByRole('status',{name:''}).filter({hasText:'Loading saved configuration'})).toBeVisible();await page.waitForTimeout(100);expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(original);await expect(page.locator('[data-theme]').first()).toHaveAttribute('data-theme','light');
});
test('strict-mode hydration is idempotent and can save after effect replay',async({page})=>{
 await open(page,{persist:true,strict:true,storageDelay:50});await waitSaved(page);await page.getByRole('radio',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'Light',exact:true}).click();await expect.poll(async()=>(await data(page))?.settings.theme).toBe('light');
});
test('malformed JSON recovers with a retained copy and visible notice',async({page})=>{
 await seed(page,'{broken');await page.evaluate(()=>window.longitudeTest.mount({persist:true}));await expect(page.getByRole('status').filter({hasText:'recovery copy'})).toBeVisible();await waitSaved(page);expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).recovery,key)).toBe('{broken');await page.reload();await expect(page.locator('.lg-dial')).toBeVisible();expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)!).recovery,key)).toBe('{broken');
});
test('future schema blocks writes and preserves original bytes',async({page})=>{
 const original=JSON.stringify({format:1,current:JSON.stringify({version:999,data:{}}),previous:null,recovery:null});await seed(page,original);await page.evaluate(()=>window.longitudeTest.mount({persist:true}));await expect(page.getByRole('alert')).toContainText('newer schema');await page.locator('.lg-dial').press('ArrowRight');await page.waitForTimeout(400);expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(original);
});
test('write failure is visible; retry commits the newest in-memory changes',async({page})=>{
 await open(page,{persist:true,failWrites:true});await expect(page.getByRole('alert')).toContainText('Test storage full');await page.getByRole('radio',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'Light',exact:true}).click();await page.evaluate(()=>window.longitudeTest.storageFailure(false,false));await page.getByRole('button',{name:'Retry',exact:true}).click();await expect.poll(async()=>(await data(page))?.settings.theme).toBe('light');
});
test('read failure retry loads saved preferences before enabling edits',async({page})=>{
 await open(page);await waitSaved(page);await page.getByRole('radio',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'Light',exact:true}).click();await expect.poll(async()=>(await data(page))?.settings.theme).toBe('light');await page.evaluate(()=>window.longitudeTest.mount({persist:true,failReads:true}));await expect(page.getByRole('alert')).toContainText('Test read failure');await expect(page.getByRole('radio',{name:'Settings',exact:true})).not.toBeVisible();await page.evaluate(()=>window.longitudeTest.storageFailure(false,false));await page.getByRole('button',{name:'Retry',exact:true}).click();await expect(page.locator('[data-theme]').first()).toHaveAttribute('data-theme','light');
});
test('two windows detect stale writes instead of losing newer configuration',async({page,context})=>{
 await open(page);await waitSaved(page);const other=await context.newPage();await other.goto('/tests/browser/fixture.html?persist=1');await expect(other.locator('.lg-dial')).toBeVisible();await other.getByRole('radio',{name:'Settings',exact:true}).click();await other.getByRole('radio',{name:'Light',exact:true}).click();await expect.poll(async()=>(await data(other))?.settings.theme).toBe('light');
 await page.getByRole('radio',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'1 min',exact:true}).click();await expect(page.getByRole('alert')).toContainText('another window');expect((await data(page)).settings.theme).toBe('light');await other.close();
});
test('rapid preference changes finish with the latest snapshot',async({page})=>{
 await open(page);await page.getByRole('radio',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'Light',exact:true}).click();await page.getByRole('radio',{name:'Dark',exact:true}).click();await page.getByRole('radio',{name:'Light',exact:true}).click();await page.getByRole('radio',{name:'24-hour',exact:true}).click();await expect.poll(async()=>(await data(page))?.settings.hour12).toBe(false);expect((await data(page)).settings.theme).toBe('light');await page.reload();await expect(page.locator('[data-theme]').first()).toHaveAttribute('data-theme','light');
});

test('an immediate normal reload flushes the latest durable edit',async({page})=>{
 await open(page);await waitSaved(page);await page.getByRole('radio',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'Light',exact:true}).click();await page.reload();await expect(page.locator('[data-theme]').first()).toHaveAttribute('data-theme','light');
});
test('legacy partial configuration migrates without changing the legacy recovery source',async({page})=>{
 await page.goto('/tests/browser/fixture.html');const legacy=JSON.stringify({settings:{theme:'light',hour12:false},groups:[{id:'old',name:'Legacy',locations:[],referenceId:null}],activeGroupId:'missing'});await page.evaluate(raw=>localStorage.setItem('longitude.v1',raw),legacy);await page.evaluate(()=>window.longitudeTest.mount({persist:true}));await expect(page.locator('[data-theme]').first()).toHaveAttribute('data-theme','light');await waitSaved(page);expect((await data(page)).activeGroupId).toBe('old');expect(await page.evaluate(()=>localStorage.getItem('longitude.v1'))).toBe(legacy);
});
test('a fresh browser page reads persisted configuration from the same profile',async({page,context})=>{
 await open(page);await page.getByRole('radio',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'Light',exact:true}).click();await expect.poll(async()=>(await data(page))?.settings.theme).toBe('light');const next=await context.newPage();await next.goto('/tests/browser/fixture.html?persist=1');await expect(next.locator('[data-theme]').first()).toHaveAttribute('data-theme','light');await next.close();
});

test('favorites control the compact widget and survive reload',async({page})=>{
 await open(page);await page.getByRole('button',{name:/More actions for Manila/}).click();await page.getByRole('menuitem',{name:'Remove from favorites'}).click();await page.getByRole('button',{name:'Compact widget',exact:true}).click();await expect(page.getByText('Manila',{exact:true})).not.toBeVisible();await expect.poll(async()=>(await data(page))?.groups[0].locations[0].favorite).toBe(false);await page.reload();await page.getByRole('button',{name:'Compact widget',exact:true}).click();await expect(page.getByText('Manila',{exact:true})).not.toBeVisible();
});
test('different cities sharing a zone can both be added and restored',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Add location',exact:true}).click();await page.getByRole('combobox').fill('Cebu');await page.getByRole('option',{name:/Cebu/}).click();await expect.poll(async()=>(await data(page))?.groups[0].locations.length).toBe(5);await page.reload();await expect(page.getByRole('listitem',{name:/^Manila,/})).toBeVisible();await expect(page.getByRole('listitem',{name:/^Cebu,/})).toBeVisible();
});
test('temporary recommendation filters never enter the saved configuration',async({page})=>{
 await open(page);await waitSaved(page);await page.getByRole('radio',{name:'Planner',exact:true}).click();await page.getByRole('button',{name:'Search options',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Recommendation search'});await dialog.getByLabel('Minimum fully working locations').fill('4');await dialog.getByRole('button',{name:'Search',exact:true}).click();await expect(page.getByText('No times meet these filters.')).toBeVisible();const d=await data(page);expect(d.request).toBeUndefined();expect(d.search).toBeUndefined();await page.reload();await page.getByRole('radio',{name:'Planner',exact:true}).click();await expect(page.getByRole('button',{name:'Clear filters'})).not.toBeVisible();
});

test('continuing after read failure explicitly disables saves for the whole session',async({page})=>{
 await open(page);await waitSaved(page);const original=await page.evaluate(k=>localStorage.getItem(k),key);await page.evaluate(()=>window.longitudeTest.mount({persist:true,failReads:true}));await page.getByRole('button',{name:'Continue without saving',exact:true}).click();await page.getByRole('radio',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'Light',exact:true}).click();await page.waitForTimeout(200);expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(original);await expect(page.getByRole('alert')).toContainText('Saving is disabled for this session');
});
