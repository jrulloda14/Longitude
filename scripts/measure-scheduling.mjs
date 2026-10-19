import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import os from 'node:os';
import { chromium } from '@playwright/test';
await mkdir('performance-results', { recursive: true });
await build({ entryPoints: ['src/lib/schedule.ts'], bundle: true, platform: 'browser', format: 'esm', outfile: 'performance-results/schedule-probe.mjs' });
async function measure(modulePath) {
  const s = await import(modulePath);
  const zones = ['America/New_York', 'Europe/London', 'Asia/Manila', 'Asia/Kathmandu', 'Australia/Lord_Howe', 'Pacific/Chatham', 'Australia/Adelaide', 'America/Los_Angeles'];
  const workloads = [];
  for (const [count, days] of [[4, 1], [12, 7], [24, 14], [32, 31]]) {
    const people = Array.from({ length: count }, (_, i) => ({ id: String(i), label: `Person ${i}`, zone: zones[i % zones.length],
      work: { start: 540, end: 1050, days: [1, 2, 3, 4, 5], intervals: [{ start: 540 + i % 4 * 15, end: 720 }, { start: 780, end: 1050 + i % 4 * 15 }] }, sleep: { start: 1380, end: 420 } }));
    const from = Date.parse('2026-10-24T00:00Z'), to = from + days * 86400000;
    const query = () => s.suggestTimes(people, from, to, 47, from + 12 * 3600000, 5, 30, { fairness: true, minOverlapMin: 0 });
    const before = typeof process !== 'undefined' ? process.memoryUsage() : null;
    let start = performance.now(); const result = query(); const coldMs = performance.now() - start;
    const warm = []; for (let i = 0; i < 7; i++) { start = performance.now(); query(); warm.push(performance.now() - start); }
    warm.sort((a, b) => a - b);
    const after = typeof process !== 'undefined' ? process.memoryUsage() : null;
    workloads.push({ participants: count, days, durationMin: 47, stepMin: 30, candidates: Math.floor((to - from - 47 * 60000) / 1800000) + 1, coldMs, warmMs: warm, warmP50Ms: warm[3], warmMaxMs: warm.at(-1), heapDeltaBytes: after ? after.heapUsed - before.heapUsed : null, rssBytes: after?.rss ?? null, results: result.map(r => ({ start: r.start, score: r.score })) });
  }
  return workloads;
}
const node = await measure(pathToFileURL(resolve('performance-results/schedule-probe.mjs')).href);
const bundle = await readFile('performance-results/schedule-probe.mjs');
const server = createServer((req, res) => { res.setHeader('Content-Type', req.url === '/module.mjs' ? 'text/javascript' : 'text/html'); res.end(req.url === '/module.mjs' ? bundle : '<!doctype html><title>Local scheduling benchmark</title>'); });
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const edge = await page.evaluate(measure, '/module.mjs');
  for (let i = 0; i < node.length; i++) if (JSON.stringify(node[i].results) !== JSON.stringify(edge[i].results)) throw new Error('Node/Edge recommendation mismatch');
  const report = { measuredAt: new Date().toISOString(), node: process.version, icu: process.versions.icu, tz: process.versions.tz, browser: browser.version(), cpu: os.cpus()[0].model, logicalProcessors: os.cpus().length, ramBytes: os.totalmem(), os: `${os.type()} ${os.release()}`, method: 'performance.now; one first-query + seven cached runs per workload in separate Node/Edge processes; same production domain bundle; split shifts and fractional zones across London DST; earlier workloads can warm shared date caches/JIT; heap deltas include GC noise; no worker', resultsMatch: true, nodeWorkloads: node, edgeWorkloads: edge };
  await mkdir('docs/evidence/milestone-3', { recursive: true });
  await writeFile('docs/evidence/milestone-3/scheduling-performance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ resultsMatch: true, node: node.map(({ participants, days, coldMs, warmP50Ms, warmMaxMs }) => ({ participants, days, coldMs, warmP50Ms, warmMaxMs })), edge: edge.map(({ participants, days, coldMs, warmP50Ms, warmMaxMs }) => ({ participants, days, coldMs, warmP50Ms, warmMaxMs })) }, null, 2));
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
