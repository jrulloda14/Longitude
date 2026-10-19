// Diagnostic ablation, not a replacement for full native process-tree acceptance trials.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import { chromium } from '@playwright/test';
const executable=resolve(process.argv[2]??'src-tauri/target/release/longitude.exe');
const output=process.argv[3]??'docs/evidence/milestone-6/native-profile.json';
const sha256=createHash('sha256').update(await readFile(executable)).digest('hex');
const child=spawn(executable,[],{windowsHide:true,env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9224 --remote-debugging-address=127.0.0.1'}});
let browser,main;
try {
 for(let i=0;i<120;i++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224',{timeout:1000});break;}catch{await delay(250);}}
 if(!browser)throw Error('Native profile endpoint unavailable');
 const pages=[];
 for(let i=0;i<120&&!main;i++) {for(const page of browser.contexts()[0].pages()){const label=await page.evaluate(()=>window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(()=>null);if(label==='main')main=page;if(label==='main'||label==='widget')pages.push({label,page});}if(!main)await delay(250);}
 await main.locator('.lg-dial').waitFor();
 const browserSession=await browser.newBrowserCDPSession(),sessions=[];
 for(const p of pages){const session=await p.page.context().newCDPSession(p.page);await session.send('Performance.enable');sessions.push({...p,session});}
 const metrics=async()=>Promise.all(sessions.map(async p=>({label:p.label,metrics:Object.fromEntries((await p.session.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]))})));
 const processInfo=async()=>(await browserSession.send('SystemInfo.getProcessInfo')).processInfo;
 const renderingConditions=await main.evaluate(()=>({visibility:document.visibilityState,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,rootClass:document.querySelector('.lg-root')?.className,devicePixelRatio,clockTransition:document.querySelector('.lg-hand-anim')?getComputedStyle(document.querySelector('.lg-hand-anim')).transitionDuration:null,pulseAnimations:Array.from(document.querySelectorAll('.lg-pulse')).flatMap(e=>e.getAnimations().map(a=>({state:a.playState,timing:a.effect?.getComputedTiming()})))}));
 console.log('Native profile: 60-second warmup');await delay(60000);
 const trials=[];
 for(const name of ['live','live-pulse-paused-diagnostic','planning']) {
  let paused = false;
  if(name==='live-pulse-paused-diagnostic'){ await main.evaluate(()=>document.querySelectorAll('.lg-pulse').forEach(e=>e.getAnimations().forEach(a=>a.pause()))); paused=true; }
  if(name==='planning')await main.locator('.lg-dial').press('ArrowRight');
  await delay(1000);
  const start=performance.now(),before=await processInfo(),m0=await metrics();await delay(45000);const after=await processInfo(),m1=await metrics(),seconds=(performance.now()-start)/1000;
  const processes=after.map(p=>{const old=before.find(b=>b.id===p.id);return{type:p.type,id:p.id,cpuSeconds:old?Math.max(0,p.cpuTime-old.cpuTime):null};});
  const renderers=m1.map((m,i)=>({label:m.label,...Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].map(k=>[k+'MsPerSecond',(m.metrics[k]-m0[i].metrics[k])*1000/seconds]))}));
  trials.push({name,seconds,processes,renderers,estimatedBrowserTotalMachineCpuPercent:processes.reduce((n,p)=>n+(p.cpuSeconds??0),0)/seconds/os.cpus().length*100});
  console.log('Profile trial complete:',name);if(paused)await main.evaluate(()=>document.querySelectorAll('.lg-pulse').forEach(e=>e.getAnimations().forEach(a=>a.play())));
 }
 await main.locator('.lg-dial').press('Home');
 const profiler=sessions.find(p=>p.label==='main').session;await profiler.send('Profiler.enable');await profiler.send('Profiler.start');await delay(15000);const {profile}=await profiler.send('Profiler.stop');
 const top=profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,20).map(n=>({function:n.callFrame.functionName,url:n.callFrame.url,hitCount:n.hitCount}));
 await writeFile(output,JSON.stringify({at:new Date().toISOString(),executable,sha256,browser:browser.version(),cores:os.cpus().length,renderingConditions,warmupSeconds:60,trials,javascriptProfile:{durationMicros:profile.endTime-profile.startTime,samples:profile.samples?.length,top},limitations:['Diagnostic browser-process CPU excludes Rust host and may miss exited processes; separate native-performance.json measures the complete process tree','45-second ablations and 15-second V8 profile are not statistical acceptance trials','Pulse pause is temporary instrumentation, not a shipped visual/animation change','No build or regression suite should run during profiling; shared host noise remains possible']},null,2)+'\n');
} finally {if(main)await main.locator('.lg-dial').press('Home').catch(()=>{});if(main)await main.evaluate(()=>window.__TAURI_INTERNALS__.invoke('longitude_window',{action:'quit'})).catch(()=>{});if(browser)await browser.close().catch(()=>{});if(child.exitCode===null){await delay(2000);if(child.exitCode===null)child.kill();}}
