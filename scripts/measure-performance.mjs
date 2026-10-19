// Development measurement only. Serves local build assets on loopback, starts
// a disposable headless Edge profile, and uses CDP. No runtime app dependency.
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { tmpdir, cpus } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';

const exec = promisify(execFile);
const options = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
const legacy = options.site === 'prototype';
const milestoneOne = options.site === 'milestone-1';
const label = legacy ? 'original-prebuilt-prototype' : milestoneOne ? 'milestone-1-saved-production-frontend' : options.site === 'milestone-4' ? 'milestone-4-production-frontend' : options.site === 'milestone-3' ? 'milestone-3-production-frontend' : 'milestone-2-production-frontend';
const seconds = Number(options.seconds ?? 20);
if (!Number.isInteger(seconds) || seconds < 10 || seconds > 120) throw new Error('Use --seconds=10 through 120');
const root = resolve(legacy ? 'prototype' : milestoneOne ? 'performance-results/milestone-1-dist' : 'dist');
const output = resolve(options.out ?? `performance-results/${label}.json`);
const edge = process.env.LONGITUDE_EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!existsSync(edge) || !existsSync(resolve(root, 'index.html'))) throw new Error('Build the app first; Edge must be installed (or set LONGITUDE_EDGE_PATH)');
await mkdir(resolve('performance-results'), { recursive: true });
const probe = await build({ entryPoints: ['src/lib/time.ts'], bundle: true, format: 'esm', write: false, target: 'es2020', minify: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/__domain-probe.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(probe.outputFiles[0].contents); return; }
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(root + sep)) throw new Error('Invalid path');
    res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(resolve(tmpdir(), 'longitude-perf-'));
const child = spawn(edge, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-background-networking',
  '--disable-component-update', '--disable-sync', '--disable-renderer-backgrounding',
  '--window-size=898,608', 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });

class Cdp {
  pending = new Map();
  listeners = new Map();
  nextId = 0;
  constructor(ws) {
    this.ws = ws;
    ws.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.id) {
        const waiting = this.pending.get(message.id);
        if (!waiting) return;
        this.pending.delete(message.id); clearTimeout(waiting.timer);
        if (message.error) waiting.reject(new Error(JSON.stringify(message.error)));
        else waiting.resolve(message.result);
      } else for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    return new Cdp(ws);
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolveCall, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 30_000);
      this.pending.set(id, { resolve: resolveCall, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  on(method, listener) { this.listeners.set(method, [...this.listeners.get(method) ?? [], listener]); }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
}

const powershell = (code) => exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', code], { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }).then(({ stdout }) => JSON.parse(stdout));
const snapshot = () => powershell(`
  $taskRows = @(Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'");
  $taskIds = [System.Collections.Generic.HashSet[int]]::new();
  [void]$taskIds.Add(${child.pid});
  do { $taskAdded = $false; foreach ($taskRow in $taskRows) {
    if ($taskIds.Contains([int]$taskRow.ParentProcessId) -and $taskIds.Add([int]$taskRow.ProcessId)) { $taskAdded = $true }
  } } while ($taskAdded);
  $taskProcs = @(Get-Process -Id @($taskIds) -ErrorAction SilentlyContinue);
  [pscustomobject]@{
    processes = @($taskProcs | Select-Object Id,CPU,PrivateMemorySize64,WorkingSet64);
    privateBytes = ($taskProcs | Measure-Object PrivateMemorySize64 -Sum).Sum;
    workingSetBytes = ($taskProcs | Measure-Object WorkingSet64 -Sum).Sum
  } | ConvertTo-Json -Depth 4 -Compress
`);

let browser, page;
try {
  let launchError;
  child.once('error', (error) => { launchError = error; });
  let browserUrl;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (launchError) throw launchError;
    try {
      const [port, path] = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
      browserUrl = `ws://127.0.0.1:${port}${path}`;
      break;
    } catch { await delay(200); }
  }
  if (!browserUrl) throw new Error('Edge launch timed out');
  browser = await Cdp.connect(browserUrl);
  const version = await browser.send('Browser.getVersion');
  const endpoint = new URL(browserUrl);
  const targets = await fetch(`http://${endpoint.host}/json/list`).then((r) => r.json());
  page = await Cdp.connect(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  const errors = [], blocked = [];
  page.on('Runtime.exceptionThrown', (event) => errors.push(event.exceptionDetails.text));
  await page.send('Runtime.enable');
  await page.send('Performance.enable');
  await page.send('Emulation.setDeviceMetricsOverride', { width: 898, height: 608, deviceScaleFactor: 1, mobile: false });
  await page.send('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Singapore' });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  page.on('Fetch.requestPaused', ({ requestId, request }) => {
    const allowed = request.url.startsWith(origin + '/');
    if (!allowed) blocked.push(request.url);
    page.send(allowed ? 'Fetch.continueRequest' : 'Fetch.failRequest', allowed ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch((error) => errors.push(error.message));
  });
  await page.send('Page.navigate', { url: origin });
  for (let n = 0; n < 100; n++) {
    if (await page.evaluate(`!!document.querySelector('.lg-dial')`)) break;
    if (n === 99) throw new Error('App did not mount');
    await delay(50);
  }
  if (!legacy) await page.evaluate(`Object.assign(document.querySelector('#root').style,{width:'850px',height:'560px',margin:'24px'})`);
  const firstMounted = await page.evaluate(`({observedAfterNavigationMs:performance.now(),paint:performance.getEntriesByType('paint').map(p=>({name:p.name,ms:p.startTime}))})`);
  await delay(3000); // warm caches/fonts; no frame instrumentation during idle
  const fonts = await page.evaluate(`Array.from(document.fonts).filter(f=>f.status==='loaded').map(f=>f.family)`);
  if (!legacy && !fonts.includes('Geist')) throw new Error('The existing Geist design token did not load its local font');
  const metric = async () => Object.fromEntries((await page.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const idle = async (name) => {
    const before = await snapshot();
    const metricsBefore = await metric();
    const start = performance.now();
    const samples = [before];
    for (let i = 0; i < 4; i++) { await delay(seconds * 250); samples.push(await snapshot()); }
    const elapsed = (performance.now() - start) / 1000;
    const after = samples.at(-1);
    const metricsAfter = await metric();
    const previous = new Map(before.processes.map((p) => [p.Id, p.CPU]));
    const peaks = new Map();
    for (const sample of samples) for (const p of sample.processes) peaks.set(p.Id, Math.max(peaks.get(p.Id) ?? 0, p.CPU));
    const cpuSeconds = [...peaks].reduce((sum, [id, cpu]) => sum + Math.max(0, cpu - (previous.get(id) ?? 0)), 0);
    return {
      mode: name, elapsedSeconds: elapsed, cpuSeconds,
      oneCoreCpuPercent: cpuSeconds / elapsed * 100,
      totalMachineCpuPercent: cpuSeconds / elapsed / cpus().length * 100,
      rendererTaskMsPerSecond: (metricsAfter.TaskDuration - metricsBefore.TaskDuration) * 1000 / elapsed,
      jsHeapUsedBytes: metricsAfter.JSHeapUsedSize,
      peakSampledPrivateBytes: Math.max(...samples.map((s) => s.privateBytes)),
      peakSampledWorkingSetBytes: Math.max(...samples.map((s) => s.workingSetBytes)),
      samples, stableProcessSet: after.processes.length === before.processes.length && after.processes.every((p) => previous.has(p.Id)),
    };
  };
  const live = await idle('live');
  // Select planning time with the real keyboard interaction; does not change app code.
  await page.evaluate(`document.querySelector('.lg-dial').focus()`);
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
  await delay(1000);
  const planning = await idle('planning');
  await page.evaluate(`(() => {
    const dial=document.querySelector('.lg-dial');
    const data=window.__longitudePerf={latencies:[],commitFrameLatencies:[],frames:[],longTasks:[],outsideMoves:0,capturedOutsideMoves:0,changedFrames:0,mutations:0,initialValue:dial.getAttribute('aria-valuenow'),running:true};
    const mutationObserver=new MutationObserver(records=>{
      if(records.some(r=>r.attributeName==='aria-valuenow')){
        data.mutations++;const start=data.lastMove;
        if(start!==undefined)requestAnimationFrame(()=>data.commitFrameLatencies.push(performance.now()-start));
      }
    });mutationObserver.observe(dial,{attributes:true,attributeFilter:['aria-valuenow']});data.mutationObserver=mutationObserver;
    const observer=new PerformanceObserver(list=>data.longTasks.push(...list.getEntries().map(e=>e.duration)));
    observer.observe({type:'longtask',buffered:false});data.observer=observer;
    const frame=t=>{data.frames.push(t);if(data.running)requestAnimationFrame(frame)};requestAnimationFrame(frame);
    dial.addEventListener('pointermove',e=>{
      if(!e.buttons)return;
      const before=dial.getAttribute('aria-valuenow');const start=performance.now();data.lastMove=start;
      const r=dial.getBoundingClientRect(),dx=e.clientX-r.x-r.width/2,dy=e.clientY-r.y-r.height/2;
      if(Math.hypot(dx,dy)>r.width/2){data.outsideMoves++;if(dial.hasPointerCapture(e.pointerId))data.capturedOutsideMoves++;}
      requestAnimationFrame(()=>{data.latencies.push(performance.now()-start);if(dial.getAttribute('aria-valuenow')!==before)data.changedFrames++;});
    },true);
  })()`);
  const rect = await page.evaluate(`(()=>{const r=document.querySelector('.lg-dial').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,r:r.width/2}})()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y - rect.r * .8, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 120; i++) {
    const angle = i / 120 * Math.PI * 6;
    const radius = rect.r * (i > 30 && i < 90 ? 1.15 : .8);
    await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + Math.sin(angle) * radius, y: rect.y - Math.cos(angle) * radius, button: 'left', buttons: 1 });
    await delay(16);
  }
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y - rect.r * .8, button: 'left', buttons: 0, clickCount: 1 });
  await delay(100);
  const drag = await page.evaluate(`(() => {
    const d=window.__longitudePerf;d.running=false;d.observer.disconnect();d.mutationObserver.disconnect();
    const stats=values=>{const v=[...values].sort((a,b)=>a-b);return{count:v.length,p50:v[Math.floor(v.length*.5)],p95:v[Math.floor(v.length*.95)],max:v.at(-1)}};
    return{eventToNextAnimationFrameMs:stats(d.latencies),eventToCommitAndFrameMs:stats(d.commitFrameLatencies),frameIntervalMs:stats(d.frames.slice(1).map((t,i)=>t-d.frames[i])),longTasksMs:d.longTasks,outsideMoves:d.outsideMoves,capturedOutsideMoves:d.capturedOutsideMoves,changedFrames:d.changedFrames,mutations:d.mutations,initialValue:d.initialValue,finalValue:document.querySelector('.lg-dial').getAttribute('aria-valuenow')};
  })()`);
  // Run the shipped domain in Edge as well as Node. No native APIs involved.
  const browserTests = await page.evaluate(`(async()=>{
    const t=await import('/__domain-probe.mjs');let checks=0;const failures=[];
    const check=(name,condition)=>{checks++;if(!condition)failures.push(name)};
    const at=Date.parse('2026-10-20T13:00Z');
    check('Manila',t.formatTimeString('Asia/Manila',at,{hour12:true})==='9:00 PM');
    check('New York',t.formatTimeString('America/New_York',at,{hour12:true})==='9:00 AM');
    check('Sydney next date',t.wallTime('Australia/Sydney',at).day===21);
    check('Kathmandu',t.offsetMinutes('Asia/Kathmandu',at)===345);
    check('Lord Howe gap',t.resolveWall('Australia/Lord_Howe',2026,10,4,2,15).gapMinutes===30);
    check('NY fold',t.resolveWall('America/New_York',2026,11,1,1,30).kind==='ambiguous');
    check('Apia skip',t.resolveWall('Pacific/Apia',2011,12,30,12,0).gapMinutes===1440);
    let invalid=false;try{t.resolveWall('UTC',2026,2,30,12,0)}catch{invalid=true};check('invalid date',invalid);
    t.nextTransition('Australia/Adelaide',Date.parse('2026-10-03T16:00Z'),2);
    check('cache freshness',t.nextTransition('Australia/Adelaide',Date.parse('2026-10-03T16:45Z'),2)===null);
    const start=t.startOfLocalDay('Europe/London',Date.parse('2026-10-25T12:00Z'));
    check('25-hour day',t.addLocalDays('Europe/London',start,1)-start===25*3600000);
    const zones=Intl.supportedValuesOf('timeZone');
    for(const zone of zones){const w=t.wallTime(zone,at);const r=t.resolveWall(zone,w.year,w.month,w.day,w.hour,w.minute);check(zone,t.formatTimeString(zone,r.instant,{hour12:false})===t.formatTimeString(zone,at,{hour12:false}));}
    return{checks,failures,runtimeZones:zones.length};
  })()`);
  const hardware = await powershell(`
    [pscustomobject]@{
      cpu = @(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors);
      system = Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer,Model,TotalPhysicalMemory;
      os = Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber;
      gpu = @(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion)
    } | ConvertTo-Json -Depth 5 -Compress
  `);
  const screenshot = await page.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve('performance-results', `${label}.png`), Buffer.from(screenshot.data, 'base64'));
  const result = { measuredAtUtc: new Date().toISOString(), site: label, cpuMethod: 'Per-process peak across snapshots minus initial CPU, including exited processes last observed; still a lower bound between samples', hardware, browser: version, node: process.version, timezone: 'Asia/Singapore', appSize: [850, 560], headless: true, fonts, firstMounted, live, planning, drag, browserTests, pageErrors: errors, blockedExternalRequests: blocked, limitations: ['Headless Edge frontend, not Tauri/WebView2 or native window measurements', 'CPU excludes measurement process and loopback asset server; working sets include shared pages', 'Process-set changes mean CPU totals can undercount exited processes; treat as lower-bound estimates', 'Event to animation frame is a proxy, not input-to-photon latency', 'Legacy prototype font requests blocked, so font rendering differs', 'Disposable browser profile is retained in OS temp for inspection'], profile };
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ output, live: { cpu: live.totalMachineCpuPercent, privateMiB: live.peakSampledPrivateBytes / 1048576 }, planning: { cpu: planning.totalMachineCpuPercent, privateMiB: planning.peakSampledPrivateBytes / 1048576 }, drag, browserTests, errors, blocked }, null, 2));
  if (errors.length || browserTests.failures.length || drag.outsideMoves !== drag.capturedOutsideMoves || !drag.outsideMoves || !drag.mutations) process.exitCode = 1;
} finally {
  page?.ws.close();
  if (browser) { try { await browser.send('Browser.close'); } catch {} browser.ws.close(); }
  else child.kill();
  server.close();
}
