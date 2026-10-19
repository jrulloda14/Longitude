// Exercises the real Windows executable/WebView2 IPC. No mock Platform or dev
// HTTP server. Debug-only test root keeps user configuration untouched.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
const output = globalThis.process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-5a';
const profile = resolve(`performance-results/native-${Date.now()}`);
const executable = resolve('src-tauri/target/debug/longitude.exe');
const results = [], pageErrors = [];
let process, browser, main, widget, executableSha256;
const invoke = (page, command, args = {}) => page.evaluate(({command,args}) => window.__TAURI_INTERNALS__.invoke(command,args), {command,args});
const snapshot = page => invoke(page,'longitude_snapshot');
const environment = () => invoke(main,'longitude_environment');
const control = (page, action) => invoke(page,'longitude_window',{action});
const settings = async patch => {
  for(let n=0;n<20;n++) {
    const s=await snapshot(main); const next=structuredClone(s.state);Object.assign(next.settings,patch);
    const reply=await invoke(main,'longitude_apply_state',{revision:s.revision,state:next,origin:'native-test',requestId:crypto.randomUUID()});
    if(reply.accepted)return reply.snapshot;
  } throw Error('Native state remained busy');
};
async function start() {
  process=spawn(executable,[],{windowsHide:true,env:{...globalThis.process.env,LONGITUDE_TEST_ROOT:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9224 --remote-debugging-address=127.0.0.1'}});
  process.stderr.on('data',data=>console.log('Native:',data.toString().trim()));
  const deadline=Date.now()+60000;
  while(Date.now()<deadline){if(process.exitCode!==null)throw Error(`Native process exited during startup: ${process.exitCode}`);try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224',{timeout:2000});break;}catch{await delay(200);}}
  if(!browser)throw Error('Native debug endpoint did not start');
  for(let attempt=0;attempt<100;attempt++) {
    for(const page of browser.contexts()[0].pages()) {
      const label=await page.evaluate(()=>window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(()=>null);
      if(label==='main')main=page;if(label==='widget')widget=page;
    }
    if(main&&widget)break;await delay(100);
  }
  for(const page of [main,widget])page.on('pageerror',error=>pageErrors.push(error.message));
  await expect(main.locator('.lg-dial')).toBeVisible({timeout:30000});
  await expect(widget.getByRole('region',{name:/compact clock/})).toBeAttached();
}
async function quit(action='quit') {
  const exited=new Promise(resolve=>process.once('exit',resolve));await control(main,action);
  await Promise.race([exited,delay(12000).then(()=>{throw Error('Native quit did not exit after flush handshake');})]);
  await browser.close().catch(()=>{});browser=null;main=null;widget=null;
}
async function check(name, body) {
  const start=performance.now();
  try{await body();results.push({name,status:'passed',durationMs:performance.now()-start});console.log('PASS',name);}
  catch(error){results.push({name,status:'failed',message:String(error),durationMs:performance.now()-start});throw error;}
}
try {
  const executableTime=(await stat(executable)).mtimeMs;
  executableSha256=createHash('sha256').update(await readFile(executable)).digest('hex');
  for(const entry of await readdir('src-tauri/src'))if(entry.endsWith('.rs')&&(await stat(`src-tauri/src/${entry}`)).mtimeMs>executableTime)throw Error('Native executable is stale; rebuild before testing.');
  await mkdir(`${output}/visual/native`,{recursive:true});await start();
  await check('native offline asset startup and independent windows',async()=>{
    const e=await environment();assert.equal(e.os,'windows');assert.equal(e.windows.find(w=>w.label==='main').visible,true);assert.equal(e.windows.find(w=>w.label==='widget').visible,false);assert.equal(e.shortcut,'Ctrl+Alt+T');assert.equal(e.autostart,false);
    await main.screenshot({path:`${output}/visual/native/clock.png`});
  });
  await check('native assets and IPC work with browser network offline',async()=>{
    await browser.contexts()[0].setOffline(true);await main.reload();await expect(main.locator('.lg-dial')).toBeVisible();assert.equal((await snapshot(main)).state.selected,null);await browser.contexts()[0].setOffline(false);
  });
  await check('native caption maximize, restore and minimize',async()=>{
    await main.getByRole('button',{name:'Maximize',exact:true}).click();await expect.poll(async()=>(await environment()).windows.find(w=>w.label==='main').maximized).toBe(true);
    await main.getByRole('button',{name:'Maximize',exact:true}).click();await expect.poll(async()=>(await environment()).windows.find(w=>w.label==='main').maximized).toBe(false);
    await main.getByRole('button',{name:'Minimize',exact:true}).click();await expect.poll(async()=>(await environment()).windows.find(w=>w.label==='main').minimized).toBe(true);await control(main,'main');
  });
  await check('show and hide do not grow the native content size',async()=>{
    const before=(await environment()).windows.find(w=>w.label==='main').size;
    for(let i=0;i<5;i++)await control(main,'main');
    assert.deepEqual((await environment()).windows.find(w=>w.label==='main').size,before);
  });
  await check('widget opens without hiding main and shares manual selection',async()=>{
    await main.getByRole('button',{name:'Compact widget',exact:true}).click();await expect.poll(async()=>(await environment()).windows.find(w=>w.label==='widget').visible).toBe(true);
    await main.locator('.lg-dial').press('ArrowRight');await expect.poll(async()=>(await snapshot(main)).state.selected).not.toBe(null);
    assert.equal((await snapshot(main)).state.selected,(await snapshot(widget)).state.selected);
    assert.equal((await environment()).windows.find(w=>w.label==='main').visible,true);
    await widget.screenshot({path:`${output}/visual/native/widget.png`});
  });
  await check('widget pin and opacity use shared durable settings',async()=>{
    await widget.getByRole('button',{name:'Unpin (stop staying on top)',exact:true}).click();await expect.poll(async()=>(await environment()).windows.find(w=>w.label==='widget').alwaysOnTop).toBe(false);
    await settings({widgetPinned:true,widgetOpacity:.8});assert.equal((await environment()).windows.find(w=>w.label==='widget').alwaysOnTop,true);assert.equal((await snapshot(widget)).state.settings.widgetOpacity,.8);
  });
  await check('widget preview timeout cannot reset a newer main-window planning selection',async()=>{
    await widget.getByRole('region',{name:/compact clock/}).press('ArrowRight');
    await main.locator('.lg-dial').press('ArrowRight');const selected=(await snapshot(main)).state.selected;
    await delay(8300);assert.equal((await snapshot(main)).state.selected,selected);
  });
  await check('widget expands and closes independently',async()=>{
    await widget.getByRole('button',{name:'Open full planner',exact:true}).click();await expect.poll(async()=>(await environment()).windows.find(w=>w.label==='widget').visible).toBe(false);
    await control(main,'widget');await widget.getByRole('button',{name:'Close widget',exact:true}).click();await expect.poll(async()=>(await environment()).windows.find(w=>w.label==='widget').visible).toBe(false);
    assert.equal((await environment()).windows.find(w=>w.label==='main').visible,true);
  });
  await check('stale cross-window transaction is rejected without lost edit',async()=>{
    const before=await snapshot(main);await settings({theme:'light'});
    const stale=await invoke(widget,'longitude_apply_state',{revision:before.revision,state:before.state,origin:'other',requestId:'stale'});assert.equal(stale.accepted,false);assert.equal(stale.snapshot.state.settings.theme,'light');
  });
  await check('native preferences UI and durable time format',async()=>{
    await main.getByRole('radio',{name:'Settings',exact:true}).click();await expect(main.getByLabel('Global shortcut',{exact:true})).toBeVisible();await expect(main.getByRole('radiogroup',{name:'Close behavior'})).toBeVisible();
    await main.getByRole('radio',{name:'24-hour',exact:true}).click();await expect.poll(async()=>(await snapshot(main)).state.settings.hour12).toBe(false);await main.screenshot({path:`${output}/visual/native/settings.png`});
  });
  await check('immediate native WebView reload does not lose the last preference',async()=>{
    await main.getByRole('radio',{name:'Dark',exact:true}).click();await main.reload();await expect(main.getByLabel('Global shortcut',{exact:true})).toBeVisible();assert.equal((await snapshot(main)).state.settings.theme,'dark');
  });
  await check('native sign-in registration can enable and disable with its original state restored',async()=>{
    const original=(await environment()).autostart;
    try { await settings({launchAtSignIn:!original});assert.equal((await environment()).autostart,!original); }
    finally { await settings({launchAtSignIn:original}); }
    assert.equal((await environment()).autostart,original);
  });
  await check('invalid shortcut reports failure and retains the owned shortcut',async()=>{
    await assert.rejects(()=>settings({globalShortcut:'Not+A+Shortcut'}));assert.equal((await environment()).shortcut,'Ctrl+Alt+T');assert.equal((await snapshot(main)).state.settings.globalShortcut,'Ctrl+Alt+T');
  });
  await check('bare typing shortcut is rejected without replacing the working binding',async()=>{
    await assert.rejects(()=>settings({globalShortcut:'T'}),/Invalid global shortcut/);
    assert.equal((await environment()).shortcut,'Ctrl+Alt+T');
    assert.equal((await snapshot(main)).state.settings.globalShortcut,'Ctrl+Alt+T');
  });
  await check('equivalent shortcut aliases preserve ownership without duplicate registration',async()=>{
    await settings({globalShortcut:'Control+Alt+T'});
    assert.equal((await environment()).shortcut,'Control+Alt+T');
    await settings({globalShortcut:'Ctrl+Alt+T'});
  });
  await check('a shortcut occupied by another native process is rejected with rollback',async()=>{
    // Actual competing OS registration, not an alias of our own binding.
    const script = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class LongitudeHotkeyFixture { [DllImport("user32.dll", SetLastError=true)] public static extern bool RegisterHotKey(IntPtr window,int id,uint modifiers,uint key); [DllImport("user32.dll")] public static extern bool UnregisterHotKey(IntPtr window,int id); }'; if (-not [LongitudeHotkeyFixture]::RegisterHotKey([IntPtr]::Zero,941,16391,74)) { exit 2 }; try { [Console]::Out.WriteLine("READY"); [Console]::Out.Flush(); [Console]::ReadLine() | Out-Null } finally { [LongitudeHotkeyFixture]::UnregisterHotKey([IntPtr]::Zero,941) | Out-Null }`;
    const fixture=spawn(`${globalThis.process.env.SystemRoot}/System32/WindowsPowerShell/v1.0/powershell.exe`,['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true});
    const exited=new Promise(resolve=>fixture.once('exit',resolve));
    try {
      await Promise.race([new Promise((resolve,reject)=>{fixture.stdout.on('data',data=>{if(data.toString().includes('READY'))resolve();});fixture.once('error',reject);fixture.once('exit',code=>reject(Error(`Hotkey fixture exited ${code}`)));}),delay(15000).then(()=>{throw Error('Competing hotkey fixture did not become ready');})]);
      await assert.rejects(()=>settings({globalShortcut:'Ctrl+Alt+Shift+J'}),/Could not register/);
      assert.equal((await environment()).shortcut,'Ctrl+Alt+T');
      assert.equal((await snapshot(main)).state.settings.globalShortcut,'Ctrl+Alt+T');
    } finally {
      fixture.stdin.end('\n');await Promise.race([exited,delay(3000)]);if(fixture.exitCode===null)fixture.kill();
    }
  });
  await check('shortcut rebind releases prior ownership',async()=>{
    await settings({globalShortcut:'Ctrl+Alt+Shift+L'});assert.equal((await environment()).shortcut,'Ctrl+Alt+Shift+L');await settings({globalShortcut:'Ctrl+Alt+T'});
  });
  await check('widget has no hydration/file-write capability',async()=>{
    await assert.rejects(()=>invoke(widget,'longitude_read_configuration',{key:'longitude.configuration'}));await assert.rejects(()=>invoke(widget,'longitude_commit_configuration',{key:'longitude.configuration',expected:null,next:'bad'}));
  });
  await check('main cannot bypass authority with a raw file commit',async()=>{
    await assert.rejects(()=>invoke(main,'longitude_commit_configuration',{key:'longitude.configuration',expected:null,next:'bad'}));
  });
  await check('native close hides with tray; reopen preserves selection',async()=>{
    const at=(await snapshot(main)).state.selected;await main.getByRole('button',{name:'Close',exact:true}).click();await expect.poll(async()=>(await environment()).windows.find(w=>w.label==='main').visible).toBe(false);
    await control(widget,'main');assert.equal((await snapshot(main)).state.selected,at);
  });
  await check('window refresh rehydrates the canonical selected instant',async()=>{
    const at=(await snapshot(main)).state.selected;await main.reload();await expect(main.getByRole('radio',{name:'Clock',exact:true})).toBeVisible();assert.equal((await snapshot(main)).state.selected,at);
  });
  let expected, dimensions;
  await check('real native process quit flushes pending settings',async()=>{
    await settings({widgetPinned:false});
    await main.getByRole('radio',{name:'Settings',exact:true}).click();await main.getByRole('radio',{name:'Dark',exact:true}).click();
    dimensions=(await environment()).windows.find(w=>w.label==='main').size;await quit();const raw=JSON.parse(await readFile(`${profile}/configuration.json`,'utf8'));expected=JSON.parse(raw.current).data;assert.equal(expected.settings.theme,'dark');assert.equal(expected.settings.hour12,false);assert.equal(expected.selected,undefined);
  });
  await check('native restart restores saved configuration and resets live session',async()=>{
    await start();const state=(await snapshot(main)).state;assert.equal(state.settings.hour12,false);assert.equal(state.settings.widgetOpacity,.8);assert.equal(state.settings.widgetPinned,false);await expect.poll(async()=>(await environment()).windows.find(w=>w.label==='widget').alwaysOnTop).toBe(false);assert.equal(state.selected,null);assert.equal(state.view,'clock');assert.deepEqual((await environment()).windows.find(w=>w.label==='main').size,dimensions);
  });
  await check('single-instance launch reopens existing authority',async()=>{
    const second=spawn(executable,[],{windowsHide:true,env:{...globalThis.process.env,LONGITUDE_TEST_ROOT:profile}});const code=await new Promise(resolve=>second.once('exit',resolve));assert.equal(code,0);assert.equal((await environment()).windows.filter(w=>w.label==='main').length,1);
  });
  await check('Close with tray disabled exits without an inaccessible background process',async()=>{
    await settings({trayIcon:false,closeBehavior:'hide'});await quit('close');await start();assert.equal((await snapshot(main)).state.settings.trayIcon,false);
  });
  await check('explicit Quit close preference exits even with a tray icon',async()=>{
    await settings({trayIcon:true,closeBehavior:'quit'});await quit('close');await start();assert.equal((await snapshot(main)).state.settings.closeBehavior,'quit');
  });
  await check('native malformed head recovers previous configuration and retains bytes',async()=>{
    await quit();const path=`${profile}/configuration.json`;const record=JSON.parse(await readFile(path,'utf8'));record.current='{corrupt';const original=JSON.stringify(record);await writeFile(path,original);await start();
    const repaired=JSON.parse(await readFile(path,'utf8'));assert.equal(repaired.recovery,original);assert.equal((await snapshot(main)).state.settings.hour12,false);
  });
  await check('native future schema cannot be overwritten',async()=>{
    await quit();const path=`${profile}/configuration.json`;const record=JSON.parse(await readFile(path,'utf8'));const head=JSON.parse(record.current);head.version=99;record.current=JSON.stringify(head);const original=JSON.stringify(record);await writeFile(path,original);await start();
    assert.equal((await environment()).shortcut,null);await assert.rejects(()=>settings({theme:'light'}));await assert.rejects(()=>settings({globalShortcut:'Ctrl+Alt+Shift+L'}));assert.equal(await readFile(path,'utf8'),original);assert.equal((await environment()).shortcut,null);
  });
  await check('no WebView page exceptions',async()=>assert.deepEqual(pageErrors,[]));
  await quit();
} catch(error) { console.error(error);globalThis.process.exitCode=1; }
finally {
  await writeFile(`${output}/native-results.json`,JSON.stringify({measuredAt:new Date().toISOString(),executable,executableSha256,profile,method:'Actual Windows debug executable and WebView2; Playwright CDP frontend input plus real Rust commands/window-state queries. Not physical mouse/monitor or tray hit-testing certification.',passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,results,pageErrors},null,2)+'\n');
  if(browser)await browser.close().catch(()=>{});
  if(process?.exitCode===null)process.kill();
}
