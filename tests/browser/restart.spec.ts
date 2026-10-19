import { test, expect, chromium, webkit } from '@playwright/test';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { resolve } from 'node:path';
test('configuration survives a real browser process restart using an isolated saved profile',async({browserName})=>{
 await mkdir('performance-results',{recursive:true});const profile=await mkdtemp(resolve('performance-results/restart-profile-'));
 const engine=browserName==='webkit'?webkit:chromium;
 const options={channel:browserName==='chromium'&&process.platform==='win32'?'msedge':undefined,headless:true};
 let browser=await engine.launchPersistentContext(profile,options);
 try {
  let page=await browser.newPage();await page.goto('http://127.0.0.1:4175/tests/browser/fixture.html?persist=1');await expect(page.locator('.lg-dial')).toBeVisible();await page.getByRole('radio',{name:'Settings',exact:true}).click();await page.getByRole('radio',{name:'Light',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>{const r=localStorage.getItem('longitude.configuration');return r?JSON.parse(JSON.parse(r).current).data.settings.theme:null;})).toBe('light');
  const before=await page.evaluate(()=>localStorage.getItem('longitude.configuration'));await browser.close();browser=await engine.launchPersistentContext(profile,options);page=await browser.newPage();await page.goto('http://127.0.0.1:4175/tests/browser/fixture.html?persist=1');await expect(page.locator('[data-theme]').first()).toHaveAttribute('data-theme','light');expect(await page.evaluate(()=>localStorage.getItem('longitude.configuration'))).toBe(before);
 }finally{await browser.close();}
});
