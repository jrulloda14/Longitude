import { build, preview } from 'vite';
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
const exec = promisify(execFile);
await build({ configFile: 'tests/browser/vite.config.ts' });
const server = await preview({ configFile: 'tests/browser/vite.config.ts' });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage(); await page.goto('http://127.0.0.1:4175/tests/browser/fixture.html');
  const zones = ['America/New_York','Europe/London','Asia/Manila','Asia/Kathmandu','Australia/Lord_Howe','Pacific/Chatham','Australia/Adelaide','America/Los_Angeles'];
  const people = Array.from({ length: 32 }, (_, i) => ({ id: String(i), label: `Person ${i}`, zone: zones[i % 8], work: { start: 360 + i, end: 405 + i, days: [0,1,2,3,4,5,6], intervals: Array.from({ length: 8 }, (_, j) => ({ start: 360 + j * 90 + i, end: 405 + j * 90 + i })) }, sleep: { start: 1380, end: 420 } }));
  const from = Date.parse('2026-10-24T00:00Z');
  const input = { people, from, to: from + (47 + 4999 * 8) * 60000, duration: 47, near: from, count: 3, step: 8, options: { fairness: true } };
  const result = await page.evaluate(async input => {
    const longTasks = [], runs = [];
    const observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => e.duration)));
    observer.observe({ type: 'longtask' });
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 50));
      const heapBefore = performance.memory?.usedJSHeapSize ?? null;
      const start = performance.now(); let last = start; const timerDrift = [];
      const timer = setInterval(() => { const now = performance.now(); timerDrift.push(Math.max(0, now - last - 10)); last = now; }, 10);
      const results = await window.longitudeTest.search(input);
      const latencyMs = performance.now() - start; clearInterval(timer);
      runs.push({ latencyMs, maxTimerDriftMs: Math.max(0, ...timerDrift), timerTicksWhileSearching: timerDrift.length, mainHeapBefore: heapBefore, mainHeapAfter: performance.memory?.usedJSHeapSize ?? null, results: results.map(r => ({ start: r.start, score: r.score })) });
    }
    await new Promise(r => setTimeout(r, 50)); observer.disconnect(); return { longTasksMs: longTasks, runs };
  }, input);
  const baseline = JSON.parse(await readFile('docs/evidence/milestone-4/scheduling-stress-before.json', 'utf8'));
  if (result.runs.some(r => JSON.stringify(r.results) !== JSON.stringify(baseline.runs[0].results))) throw new Error('Worker result differs from synchronous reference');
  const session = await browser.newBrowserCDPSession();
  const memory = async () => {
    const { processInfo } = await session.send('SystemInfo.getProcessInfo');
    const ids = processInfo.map(p => Number(p.id)).filter(Number.isSafeInteger);
    const script = `$p = @(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue); [pscustomobject]@{ privateBytes = ($p | Measure-Object PrivateMemorySize64 -Sum).Sum; workingSetBytes = ($p | Measure-Object WorkingSet64 -Sum).Sum; processes = $p.Count } | ConvertTo-Json -Compress`;
    const { stdout } = await exec('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true }); return JSON.parse(stdout);
  };
  const beforeMemory = await memory(); const duringMemory = [];
  // Start a single sampler BEFORE the extra run; spawning PowerShell separately
  // for each sample can miss the worker's entire lifetime on this host.
  const { processInfo } = await session.send('SystemInfo.getProcessInfo');
  const ids = processInfo.map(p => Number(p.id)).filter(Number.isSafeInteger);
  const script = `'READY'; for ($n=0; $n -lt 60; $n++) { $p=@(Get-Process -Id ${ids.join(',')} -ErrorAction SilentlyContinue); [pscustomobject]@{privateBytes=($p|Measure-Object PrivateMemorySize64 -Sum).Sum;workingSetBytes=($p|Measure-Object WorkingSet64 -Sum).Sum;processes=$p.Count}|ConvertTo-Json -Compress;Start-Sleep -Milliseconds 20 }`;
  const sampler = spawn('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  let liveWorkers = 0, buffer = '', ready;
  page.on('worker', worker => { liveWorkers++; worker.on('close', () => liveWorkers--); });
  const started = new Promise(done => { ready = done; });
  sampler.stdout.on('data', chunk => {
    buffer += chunk.toString(); let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1);
      if (line === 'READY') ready(); else if (line.startsWith('{')) duringMemory.push({ ...JSON.parse(line), workerObservedAlive: liveWorkers > 0 });
    }
  });
  const stopped = new Promise(done => sampler.on('close', done));
  await started;
  await page.evaluate(input => window.longitudeTest.search(input), input);
  await stopped; const afterMemory = await memory();
  const report = { measuredAt: new Date().toISOString(), browser: browser.version(), cpu: os.cpus()[0].model, logicalProcessors: os.cpus().length, ramBytes: os.totalmem(), os: `${os.type()} ${os.release()}`, participants: 32, intervals: 8, candidateStarts: 5000, resultsMatch: true,
    method: 'Actual Vite production worker/client through isolated browser fixture; three new-worker runs; 10ms main-thread timer drift and Long Tasks; performance.memory covers MAIN heap only. Separate browser-process private/working-set snapshots include the worker but are sampled, not continuous peaks or native app memory.',
    ...result, memory: { before: beforeMemory, during: duringMemory, after: afterMemory } };
  await writeFile('docs/evidence/milestone-4/scheduling-stress-worker.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); await new Promise(done => server.httpServer.close(done)); }
