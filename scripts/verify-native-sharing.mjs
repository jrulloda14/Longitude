// Real Windows clipboard + native Save dialog verification. Drive the two OS dialogs
// with the documented computer-use skill while this harness awaits their outcomes.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import ICAL from 'ical.js';
const output='docs/evidence/milestone-6',profile=resolve(`performance-results/m6-sharing-${Date.now()}`),executable=resolve('src-tauri/target/debug/longitude.exe');
const ps=`${process.env.SystemRoot}/System32/WindowsPowerShell/v1.0/powershell.exe`,exec=promisify(execFile),results=[],errors=[];
await mkdir(profile,{recursive:true});let browser,main,widget;
const app=spawn(executable,[],{windowsHide:true,env:{...process.env,LONGITUDE_TEST_ROOT:profile,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9224 --remote-debugging-address=127.0.0.1'}});
app.stderr.on('data',s=>console.log('Native:',s.toString().trim()));
const invoke=(page,command,args={})=>page.evaluate(({command,args})=>window.__TAURI_INTERNALS__.invoke(command,args),{command,args});
async function check(name,fn){try{await fn();results.push({name,status:'passed'});console.log('PASS',name);}catch(e){results.push({name,status:'failed',message:String(e)});throw e;}}
const clipboard=async()=> (await exec(ps,['-STA','-NoProfile','-NonInteractive','-Command','[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false);[Console]::Out.Write((Get-Clipboard -Raw))'],{windowsHide:true,encoding:'utf8'})).stdout.replace(/\r\n/g,'\n');
try {
 for(let i=0;i<120;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224',{timeout:1000});break;}catch{await delay(250);}}
 assert.ok(browser,'native endpoint');
 for(let i=0;i<100&&(!main||!widget);i++){for(const p of browser.contexts()[0].pages()){const label=await p.evaluate(()=>window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(()=>null);if(label==='main')main=p;if(label==='widget')widget=p;}if(!main||!widget)await delay(100);}
 await expect(main.locator('.lg-dial')).toBeVisible({timeout:30000});for(const p of [main,widget])p.on('pageerror',e=>errors.push(e.message));
 const snapshot=await invoke(main,'longitude_snapshot');const state=structuredClone(snapshot.state);state.selected=Date.parse('2026-11-01T05:30:00Z');state.view='clock';state.meeting={title:'Meeting; 團隊 🙂',durationMin:90,weekly:false};
 const reply=await invoke(main,'longitude_apply_state',{revision:snapshot.revision,state,origin:'m6-native-sharing-test',requestId:randomUUID()});assert.equal(reply.accepted,true);
 await main.getByRole('button',{name:'Share this time',exact:true}).click();const dialog=main.getByRole('dialog',{name:'Share meeting time'});
 await mkdir(`${output}/visual/native`,{recursive:true});await main.screenshot({path:`${output}/visual/native/share.png`});
 for(const [mode,label]of[['Full','Copy summary'],['One line','Copy line'],['Local times','Copy local times'],['UTC','Copy UTC']])await check(`Actual OS clipboard: ${mode}`,async()=>{
  await dialog.getByRole('radio',{name:mode,exact:true}).click();const text=await dialog.getByLabel('Summary preview').textContent();await dialog.getByRole('button',{name:label,exact:true}).click();await expect(dialog.getByRole('status')).toHaveText('Copied selected text.');assert.equal(await clipboard(),text.replace(/\r\n/g,'\n'));
 });
 await dialog.getByRole('radio',{name:'Full',exact:true}).click();const preview=await dialog.getByLabel('Summary preview').textContent();
 await dialog.getByRole('button',{name:'Export .ics',exact:true}).click();console.log('WAIT_NATIVE_CANCEL: use the actual native dialog Cancel button.');
 await check('Quit is deferred while the native Save operation is active',async()=>{await invoke(main,'longitude_window',{action:'quit'});await delay(250);assert.equal(app.exitCode,null);});
 await check('Actual native Save dialog cancellation is neutral',async()=>{await expect(dialog.getByRole('status')).toHaveText('Save cancelled.',{timeout:300000});await expect(dialog.getByRole('alert')).toHaveCount(0);});
 await dialog.getByRole('button',{name:'Export .ics',exact:true}).click();console.log('WAIT_NATIVE_SAVE: save to '+resolve(profile,'meeting.ics'));
 await check('Actual native Save writes an independently validated calendar',async()=>{
  await expect(dialog.getByRole('status')).toHaveText('Calendar file saved.',{timeout:300000});const bytes=await readFile(resolve(profile,'meeting.ics')),ics=bytes.toString('utf8');
  const component=new ICAL.Component(ICAL.parse(ics)),event=new ICAL.Event(component.getFirstSubcomponent('vevent'));
  assert.equal(event.startDate.toJSDate().getTime(),state.selected);assert.equal(event.endDate.subtractDate(event.startDate).toSeconds(),5400);assert.equal(event.description,preview);assert.equal(event.summary,state.meeting.title);assert.ok(ics.endsWith('\r\n'));assert.ok(ics.split('\r\n').every(l=>Buffer.byteLength(l)<=75));
  await writeFile(`${output}/native-export.ics`,bytes);await writeFile(`${output}/native-export-validation.json`,JSON.stringify({parser:'ical.js 2.2.1 (independent)',uid:event.uid,summary:event.summary,startUTC:event.startDate.toJSDate().toISOString(),endUTC:event.endDate.toJSDate().toISOString(),elapsedSeconds:5400,descriptionEqualsVisiblePreview:true,crlf:true,foldingWithin75Octets:true},null,2)+'\n');
 });
 await check('Native filename traversal is rejected before any dialog',async()=>{await assert.rejects(()=>invoke(main,'longitude_save_calendar',{name:'../bad.ics',contents:'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'}));});
 await check('Native malformed export is rejected before any dialog',async()=>{await assert.rejects(()=>invoke(main,'longitude_save_calendar',{name:'meeting.ics',contents:'wrong'}));});
 await check('Widget is denied text clipboard command',async()=>{await assert.rejects(()=>invoke(widget,'longitude_copy_text',{text:'not permitted'}));});
 await check('Widget is denied calendar Save command',async()=>{await assert.rejects(()=>invoke(widget,'longitude_save_calendar',{name:'meeting.ics',contents:'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n'}));});
 await check('No WebView JavaScript exceptions',async()=>assert.deepEqual(errors,[]));
 await check('Native Quit succeeds after the Save dialog closes',async()=>{const exited=new Promise(r=>app.once('exit',r));await invoke(main,'longitude_window',{action:'quit'});const code=await Promise.race([exited,delay(12000).then(()=>{throw Error('Quit timeout');})]);assert.equal(code,0);});
}catch(e){console.error(e);process.exitCode=1;}
finally{
 await writeFile(`${output}/native-sharing-results.json`,JSON.stringify({at:new Date().toISOString(),executable,sha256:createHash('sha256').update(await readFile(executable)).digest('hex'),profile,externalClipboardDenial:'Not verified: experimental external lock fixture did not deny a direct native write on this host; retained failures are separate. Adapter/UI failures are covered by unit/browser tests.',passed:results.filter(r=>r.status==='passed').length,failed:results.filter(r=>r.status==='failed').length,results,errors,method:'Actual Windows Tauri/WebView2, OS clipboard and native Save dialog; dialog driven through computer-use skill. Filesystem error preservation is separately tested by actual Rust filesystem tests.'},null,2)+'\n');
 if(browser)await browser.close().catch(()=>{});if(app.exitCode===null)app.kill();
}
