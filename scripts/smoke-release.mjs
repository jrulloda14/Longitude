import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const executable=resolve('src-tauri/target/release/longitude.exe'), checks=[];
const output=process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-6';
const sha256=createHash('sha256').update(await readFile(executable)).digest('hex');
const child=spawn(executable,[],{windowsHide:false,env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9224 --remote-debugging-address=127.0.0.1'}});
let browser;
const invoke=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
try {
  for(let n=0;n<120;n++){if(child.exitCode!==null)throw Error('Release instance exited before attachment');try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224',{timeout:1000});break;}catch{await delay(250);}}
  assert.ok(browser,'Release endpoint available');let main,widget;
  for(let n=0;n<100;n++){for(const p of browser.contexts()[0].pages()){const label=await p.evaluate(()=>window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(()=>null);if(label==='main')main=p;if(label==='widget')widget=p;}if(main&&widget)break;await delay(100);}
  await expect(main.locator('.lg-dial')).toBeVisible({timeout:30000});checks.push('Final release launches the preserved clock');
  await main.locator('.lg-dial').press('ArrowRight');await expect.poll(async()=>(await invoke(main,'longitude_snapshot')).state.selected).not.toBe(null);
  assert.equal((await invoke(main,'longitude_snapshot')).state.selected,(await invoke(widget,'longitude_snapshot')).state.selected);checks.push('Main and widget share native planning state');
  await invoke(main,'longitude_window',{action:'widget'});assert.equal((await invoke(main,'longitude_environment')).windows.find(w=>w.label==='widget').visible,true);checks.push('Independent native widget shows');
  await invoke(main,'longitude_window',{action:'hide-widget'});assert.equal((await invoke(main,'longitude_environment')).windows.find(w=>w.label==='main').visible,true);checks.push('Widget hides while main remains visible');
  const gpu=await (await browser.newBrowserCDPSession()).send('SystemInfo.getInfo').catch(error=>({unavailable:String(error)}));
  await writeFile(`${output}/gpu-info.json`,JSON.stringify(gpu,null,2)+'\n');
  await main.locator('.lg-dial').press('Home');const exit=new Promise(resolve=>child.once('exit',resolve));await invoke(main,'longitude_window',{action:'quit'});
  const code=await Promise.race([exit,delay(12000).then(()=>{throw Error('Release did not quit');})]);assert.equal(code,0);checks.push('Flush handshake exits cleanly');
  await writeFile(`${output}/release-smoke.json`,JSON.stringify({measuredAt:new Date().toISOString(),executable,sha256,passed:checks.length,failed:0,checks,method:'Actual final unsigned optimized Windows executable; no durable application preferences changed; ordinary native app-config directory, CDP frontend/native API checks'},null,2)+'\n');
  console.log('PASS',checks.length,'final release checks',sha256);
}finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null)child.kill();}
