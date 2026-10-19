import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import { chromium } from '@playwright/test';
const exec=promisify(execFile), file=`${process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-5a'}/native-performance.json`;
const executable=resolve('src-tauri/target/release/longitude.exe');
const measuredExecutableSha256=createHash('sha256').update(await readFile(executable)).digest('hex');
const started=performance.now();
const child=spawn(executable,[],{windowsHide:false,env:{...process.env,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:'--remote-debugging-port=9224 --remote-debugging-address=127.0.0.1'}});
let browser;
const ps=async script=>{
  for(let attempt=0;attempt<3;attempt++)try{
    return JSON.parse((await exec(`${process.env.SystemRoot}/System32/WindowsPowerShell/v1.0/powershell.exe`,['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,maxBuffer:4*1024*1024})).stdout);
  }catch(error){if(error.code!=='EPERM'||attempt===2)throw error;await delay(250);}
};
const sample=()=>ps(`$taskRows=@(Get-CimInstance Win32_Process);$taskIds=[System.Collections.Generic.HashSet[int]]::new();[void]$taskIds.Add(${child.pid});do{$taskAdded=$false;foreach($taskRow in $taskRows){if($taskIds.Contains([int]$taskRow.ParentProcessId)-and $taskIds.Add([int]$taskRow.ProcessId)){$taskAdded=$true}}}while($taskAdded);$taskProcs=@(Get-Process -Id @($taskIds) -ErrorAction SilentlyContinue);[pscustomobject]@{processes=@($taskProcs|Select-Object Id,CPU,PrivateMemorySize64,WorkingSet64);privateBytes=($taskProcs|Measure-Object PrivateMemorySize64 -Sum).Sum;workingSetBytes=($taskProcs|Measure-Object WorkingSet64 -Sum).Sum}|ConvertTo-Json -Depth 4 -Compress`);
try {
  for(let attempt=0;attempt<120;attempt++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:9224',{timeout:1000});break;}catch{await delay(250);}}
  if(!browser)throw Error('Native endpoint unavailable');
  let page;
  for(let attempt=0;attempt<120;attempt++){for(const candidate of browser.contexts()[0].pages()){if(await candidate.evaluate(()=>window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(()=>null)==='main')page=candidate;}if(page)break;await delay(250);}
  await page.locator('.lg-dial').waitFor({state:'visible',timeout:30000});
  const mountedMs=performance.now()-started, errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const session=await page.context().newCDPSession(page);await session.send('Performance.enable');
  const metrics=async()=>Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  console.log('Native mounted; warming for 60 seconds');await delay(60000);
  const idle=async mode=>{
    const before=await sample(), initial=await metrics(), start=performance.now(), samples=[before];
    for(let n=0;n<4;n++){await delay(30000);samples.push(await sample());}
    const elapsed=(performance.now()-start)/1000, after=await metrics(), previous=new Map(before.processes.map(p=>[p.Id,p.CPU])),peaks=new Map();
    for(const s of samples)for(const p of s.processes)peaks.set(p.Id,Math.max(peaks.get(p.Id)??0,p.CPU));
    const cpuSeconds=[...peaks].reduce((sum,[id,cpu])=>sum+Math.max(0,cpu-(previous.get(id)??0)),0);
    return {mode,elapsedSeconds:elapsed,cpuSeconds,totalMachineCpuPercent:cpuSeconds/elapsed/os.cpus().length*100,oneCoreCpuPercent:cpuSeconds/elapsed*100,rendererTaskMsPerSecond:(after.TaskDuration-initial.TaskDuration)*1000/elapsed,jsHeapUsedBytes:after.JSHeapUsedSize,peakSampledPrivateBytes:Math.max(...samples.map(s=>s.privateBytes)),peakSampledWorkingSetBytes:Math.max(...samples.map(s=>s.workingSetBytes)),stableProcessSet:samples.every(s=>s.processes.length===before.processes.length&&s.processes.every(p=>previous.has(p.Id))),samples};
  };
  const live=await idle('main-live-widget-hidden');console.log('Live measurement complete');
  await page.locator('.lg-dial').press('ArrowRight');await delay(1000);const planning=await idle('main-planning-widget-hidden');console.log('Planning measurement complete');
  await page.evaluate(()=>{
    const dial=document.querySelector('.lg-dial'), d=window.longitudeNativePerf={events:[],commits:[],frames:[],longTasks:[],outside:0,captured:0,running:true};
    d.mo=new MutationObserver(()=>{if(d.last)requestAnimationFrame(()=>d.commits.push(performance.now()-d.last));});d.mo.observe(dial,{attributes:true,attributeFilter:['aria-valuenow']});
    d.po=new PerformanceObserver(list=>d.longTasks.push(...list.getEntries().map(e=>e.duration)));d.po.observe({type:'longtask'});
    const frame=t=>{d.frames.push(t);if(d.running)requestAnimationFrame(frame);};requestAnimationFrame(frame);
    dial.addEventListener('pointermove',e=>{if(!e.buttons)return;const t=performance.now();d.last=t;const r=dial.getBoundingClientRect();if(Math.hypot(e.clientX-r.x-r.width/2,e.clientY-r.y-r.height/2)>r.width/2){d.outside++;if(dial.hasPointerCapture(e.pointerId))d.captured++;}requestAnimationFrame(()=>d.events.push(performance.now()-t));},true);
  });
  const box=await page.locator('.lg-dial').boundingBox(), center={x:box.x+box.width/2,y:box.y+box.height/2}, radius=box.width/2;
  await page.mouse.move(center.x,center.y-radius*.8);await page.mouse.down();
  for(let n=1;n<=120;n++){const a=n/120*Math.PI*6,r=radius*(n>30&&n<90?1.15:.8);await page.mouse.move(center.x+Math.sin(a)*r,center.y-Math.cos(a)*r);await delay(16);}
  await page.mouse.up();await delay(100);
  const drag=await page.evaluate(()=>{const d=window.longitudeNativePerf;d.running=false;d.mo.disconnect();d.po.disconnect();const stats=a=>{const s=[...a].sort((a,b)=>a-b);return{count:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)}};return{eventToFrameMs:stats(d.events),commitToFrameProxyMs:stats(d.commits),frameIntervalMs:stats(d.frames.slice(1).map((t,i)=>t-d.frames[i])),longTasksMs:d.longTasks,outsideMoves:d.outside,capturedOutsideMoves:d.captured};});
  const hardware=await ps('[pscustomobject]@{cpu=@(Get-CimInstance Win32_Processor|Select-Object Name,NumberOfCores,NumberOfLogicalProcessors);system=(Get-CimInstance Win32_ComputerSystem|Select-Object Manufacturer,Model,TotalPhysicalMemory);os=(Get-CimInstance Win32_OperatingSystem|Select-Object Caption,Version,BuildNumber);gpu=@(Get-CimInstance Win32_VideoController|Select-Object Name,DriverVersion)}|ConvertTo-Json -Depth 5 -Compress');
  const environment=await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('longitude_environment'));
  await mkdir(resolve(file,'..'),{recursive:true});
  await writeFile(file,JSON.stringify({measuredAt:new Date().toISOString(),executable,measuredExecutableSha256,build:'Unsigned release, actual Windows/WebView2, visible main window and created hidden widget',browser:browser.version(),hardware,mountedObservedMs:mountedMs,warmupSeconds:60,nominalSecondsPerMode:120,live,planning,drag,environment,errors,limitations:['Process CPU uses last observed peaks; can miss exited subprocess work','Private memory is sampled aggregate; working sets include shared pages','Single run on a shared development host, not a statistical trial','CDP instrumentation and event/frame proxies are not physical input-to-photon latency','No mixed-monitor/high-DPI or Windows 11 performance verification']},null,2)+'\n');
  console.log(JSON.stringify({liveCpu:live.totalMachineCpuPercent,planningCpu:planning.totalMachineCpuPercent,livePrivateMiB:live.peakSampledPrivateBytes/1048576,planningPrivateMiB:planning.peakSampledPrivateBytes/1048576,drag},null,2));
  await page.locator('.lg-dial').press('Home');
  await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('longitude_window',{action:'quit'}));
}finally{if(browser)await browser.close().catch(()=>{});if(child.exitCode===null){await delay(2000);if(child.exitCode===null)child.kill();}}
