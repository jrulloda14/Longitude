// M7.0 controlled native resource trials. Repeats interleaved trials of one or
// more release executables under labelled observer conditions, records the
// role of every process in the native tree and the host state that the earlier
// single-trial measure-native.mjs did not capture. Does not change the app.
//
// Usage: node scripts/measure-native-trials.mjs [--rounds=5] [--warmup=60] [--window=120]
//   [--exe=label=path ...] [--configs=label:observer,...] [--out=dir]
// observer: attached (CDP client + Performance domain held open, as in M6),
//           detached (debug port open, no client during windows),
//           noport (no remote debugging at all; live window only).
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import { chromium } from '@playwright/test';

const arg = (name, fallback) => { const hit = process.argv.slice(2).filter(a => a.startsWith(`--${name}=`)).map(a => a.slice(name.length + 3)); return hit.length ? hit : fallback; };
const rounds = Number(arg('rounds', ['5'])[0]), warmup = Number(arg('warmup', ['60'])[0]), windowSeconds = Number(arg('window', ['120'])[0]);
const out = resolve(arg('out', [`${process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-7'}/native-trials`])[0]);
const exes = Object.fromEntries(arg('exe', ['m6=src-tauri/target/release/longitude.exe']).map(e => { const [label, path] = e.split('='); return [label, resolve(path)]; }));
const configs = arg('configs', [Object.keys(exes).map(l => `${l}:attached,${l}:detached,${l}:noport`).join(',')])[0].split(',').map(c => { const [exe, observer] = c.split(':'); return { exe, observer }; });
for (const c of configs) if (!exes[c.exe] || !['attached', 'detached', 'noport'].includes(c.observer)) throw Error(`Bad config ${c.exe}:${c.observer}`);
const sampleEvery = 30, port = 9224, cores = os.cpus().length;
const exec = promisify(execFile);
const ps = async script => {
  for (let attempt = 0; ; attempt++) try {
    const { stdout } = await exec(`${process.env.SystemRoot}/System32/WindowsPowerShell/v1.0/powershell.exe`, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (error) { if (attempt === 2) throw error; await delay(250); }
};
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');

// Classify WebView2/Tauri processes from their command lines.
// Other applications on the shared desktop are generalized so evidence never
// records which personal apps the tester runs.
const KEEP = /^(msedgewebview2|dwm|System|powershell|node|csrss|svchost|Idle|MsMpEng|explorer|audiodg|WmiPrvSE)$/i;
const redact = name => KEEP.test(name) ? name : 'other-app';
const role = (name, cmd = '') => {
  if (/longitude\.exe$/i.test(name)) return 'host';
  if (!/msedgewebview2/i.test(name)) return name.toLowerCase();
  const type = /--type=([\w-]+)/.exec(cmd)?.[1];
  if (!type) return 'browser';
  if (type === 'utility') return `utility:${/--utility-sub-type=([\w.]+)/.exec(cmd)?.[1]?.split('.')[0] ?? 'unknown'}`;
  return type;
};
// Process tree rooted at the host, with roles; plus every process's CPU so other
// load on the shared desktop can be attributed.
const sample = rootPid => ps(`$rows=@(Get-CimInstance Win32_Process);$ids=[System.Collections.Generic.HashSet[int]]::new();[void]$ids.Add(${rootPid});do{$added=$false;foreach($r in $rows){if($ids.Contains([int]$r.ParentProcessId)-and $ids.Add([int]$r.ProcessId)){$added=$true}}}while($added);
$tree=@($rows|Where-Object{$ids.Contains([int]$_.ProcessId)}|ForEach-Object{$p=Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue;if($p){[pscustomobject]@{id=[int]$_.ProcessId;name=$_.Name;cmd=$_.CommandLine;cpu=$p.CPU;priv=$p.PrivateMemorySize64;ws=$p.WorkingSet64}}});
$all=@(Get-Process|Where-Object{$_.CPU -ne $null}|Select-Object @{n='id';e={$_.Id}},@{n='name';e={$_.ProcessName}},@{n='cpu';e={$_.CPU}});
[pscustomobject]@{tree=$tree;all=$all}|ConvertTo-Json -Depth 4 -Compress`);
// Host state relevant to frame pacing and background load.
const hostState = async () => { const h = await psHost(); const timeout = parseInt(/0x([0-9a-f]+)/i.exec(h.displayTimeoutAc ?? '')?.[1] ?? '0', 16); return { ...h, otherWebView2Hosts: (h.otherWebView2Hosts ?? []).filter(n => !/longitude/i.test(n)).length, session: process.env.SESSIONNAME ?? null, displayTimeoutAcSeconds: timeout, displayLikelyOff: timeout > 0 && h.userIdleSeconds > timeout }; };
const psHost = () => ps(`Add-Type -Namespace M7 -Name U -MemberDefinition '[StructLayout(LayoutKind.Sequential)] public struct LII { public uint cbSize; public uint dwTime; } [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LII p); [DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);';
$l=New-Object M7.U+LII;$l.cbSize=8;[void][M7.U]::GetLastInputInfo([ref]$l);$idle=([Environment]::TickCount-$l.dwTime)/1000;$fp=0;[void][M7.U]::GetWindowThreadProcessId([M7.U]::GetForegroundWindow(),[ref]$fp);$fg=Get-Process -Id $fp -ErrorAction SilentlyContinue;
$video=@(Get-CimInstance Win32_VideoController|Select-Object Name,DriverVersion,CurrentRefreshRate,CurrentHorizontalResolution,CurrentVerticalResolution);
$scheme=(powercfg /getactivescheme) -join ' ';$displayTimeout=((powercfg /query SCHEME_CURRENT SUB_VIDEO VIDEOIDLE) -match 'Current AC Power Setting Index') -join ' ';
$wv=@(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'"|ForEach-Object{(Get-CimInstance Win32_Process -Filter "ProcessId=$($_.ParentProcessId)").Name}|Where-Object{$_ -and $_ -ne 'msedgewebview2.exe'}|Sort-Object -Unique);
$wvVer=(Get-ItemProperty 'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue).pv;
[pscustomobject]@{userIdleSeconds=$idle;foregroundProcess=$fg.ProcessName;foregroundPid=$fp;video=$video;powerScheme=$scheme;displayTimeoutAc=$displayTimeout;battery=@(Get-CimInstance Win32_Battery).Count;session=$env:SESSIONNAME;otherWebView2Hosts=$wv;webView2Runtime=$wvVer;edgeProcesses=@(Get-Process msedge -ErrorAction SilentlyContinue).Count}|ConvertTo-Json -Depth 4 -Compress`);
const machineTimes = () => os.cpus().reduce((t, c) => { const v = c.times; t.idle += v.idle; t.total += v.user + v.nice + v.sys + v.idle + v.irq; return t; }, { idle: 0, total: 0 });

async function attach(child) {
  let browser, page;
  for (let n = 0; n < 160 && !browser; n++) { if (child.exitCode !== null) throw Error('Instance exited before attachment'); try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 1000 }); } catch { await delay(250); } }
  if (!browser) throw Error('Native endpoint unavailable');
  for (let n = 0; n < 160 && !page; n++) { for (const p of browser.contexts()[0]?.pages() ?? []) if (await p.evaluate(() => window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label).catch(() => null) === 'main') page = p; if (!page) await delay(250); }
  if (!page) throw Error('Main page unavailable');
  await page.locator('.lg-dial').waitFor({ state: 'visible', timeout: 30000 });
  return { browser, page };
}
// Short rAF probe; run outside measured windows so it never perturbs them.
const frameProbe = page => page.evaluate(() => new Promise(done => { const t = []; const f = now => { t.push(now); if (t.length < 181) requestAnimationFrame(f); else { const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b); done({ frames: d.length, p50: d[Math.floor(d.length * .5)], p95: d[Math.floor(d.length * .95)], max: d.at(-1) }); } }; requestAnimationFrame(f); }));
const conditions = page => page.evaluate(() => ({ visibility: document.visibilityState, focused: document.hasFocus(), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, devicePixelRatio, clockTransition: document.querySelector('.lg-hand-anim') ? getComputedStyle(document.querySelector('.lg-hand-anim')).transitionDuration : null, runningAnimations: document.getAnimations().filter(a => a.playState === 'running').map(a => a.animationName ?? a.constructor.name), live: document.querySelector('.lg-dial')?.getAttribute('aria-valuetext')?.endsWith(', now') ?? null }));

async function idleWindow(rootPid, mode, metrics) {
  const first = await sample(rootPid), m0 = await metrics?.(), t0 = machineTimes(), start = performance.now(), samples = [first];
  for (let left = windowSeconds; left > 0; left -= sampleEvery) { await delay(Math.min(sampleEvery, left) * 1000); samples.push(await sample(rootPid)); }
  const elapsed = (performance.now() - start) / 1000, t1 = machineTimes(), m1 = await metrics?.();
  const last = samples.at(-1), base = new Map(first.tree.map(p => [p.id, p.cpu]));
  // Last observed CPU per process, retaining processes that exit mid-window.
  const seen = new Map(); for (const s of samples) for (const p of s.tree) seen.set(p.id, p);
  const processes = [...seen.values()].map(p => ({ id: p.id, role: role(p.name, p.cmd), cpuSeconds: Math.max(0, p.cpu - (base.get(p.id) ?? 0)), privateMiB: p.priv / 1048576, newInWindow: !base.has(p.id) }));
  const byRole = {}; for (const p of processes) byRole[p.role] = (byRole[p.role] ?? 0) + p.cpuSeconds / elapsed / cores * 100;
  const appCpu = processes.reduce((n, p) => n + p.cpuSeconds, 0) / elapsed / cores * 100;
  const allBase = new Map(first.all.map(p => [p.id, p])), treeIds = new Set(seen.keys());
  const others = last.all.filter(p => !treeIds.has(p.id) && allBase.has(p.id)).map(p => ({ name: redact(p.name), pct: (p.cpu - allBase.get(p.id).cpu) / elapsed / cores * 100 })).filter(p => p.pct > 0.05).sort((a, b) => b.pct - a.pct).slice(0, 8);
  const machineBusy = (1 - (t1.idle - t0.idle) / (t1.total - t0.total)) * 100;
  return { mode, elapsedSeconds: elapsed, totalMachineCpuPercent: appCpu, cpuByRolePercent: byRole, machineBusyPercent: machineBusy, otherLoadPercent: Math.max(0, machineBusy - appCpu), topOtherProcesses: others,
    rendererTaskMsPerSecond: m0 && m1 ? (m1.TaskDuration - m0.TaskDuration) * 1000 / elapsed : null,
    peakSampledPrivateMiB: Math.max(...samples.map(s => s.tree.reduce((n, p) => n + p.priv, 0))) / 1048576,
    stableProcessSet: samples.every(s => s.tree.length === first.tree.length && s.tree.every(p => base.has(p.id))), processes };
}

async function drag(page) {
  await page.evaluate(() => { const dial = document.querySelector('.lg-dial'), d = window.m7drag = { events: [], commits: [], frames: [], longTasks: [], outside: 0, captured: 0, running: true };
    d.mo = new MutationObserver(() => { if (d.last) requestAnimationFrame(() => d.commits.push(performance.now() - d.last)); }); d.mo.observe(dial, { attributes: true, attributeFilter: ['aria-valuenow'] });
    d.po = new PerformanceObserver(l => d.longTasks.push(...l.getEntries().map(e => e.duration))); d.po.observe({ type: 'longtask' });
    const f = t => { d.frames.push(t); if (d.running) requestAnimationFrame(f); }; requestAnimationFrame(f);
    dial.addEventListener('pointermove', e => { if (!e.buttons) return; const t = performance.now(); d.last = t; const r = dial.getBoundingClientRect(); if (Math.hypot(e.clientX - r.x - r.width / 2, e.clientY - r.y - r.height / 2) > r.width / 2) { d.outside++; if (dial.hasPointerCapture(e.pointerId)) d.captured++; } requestAnimationFrame(() => d.events.push(performance.now() - t)); }, true); });
  const box = await page.locator('.lg-dial').boundingBox(), c = { x: box.x + box.width / 2, y: box.y + box.height / 2 }, radius = box.width / 2;
  await page.mouse.move(c.x, c.y - radius * .8); await page.mouse.down();
  for (let n = 1; n <= 120; n++) { const a = n / 120 * Math.PI * 6, r = radius * (n > 30 && n < 90 ? 1.15 : .8); await page.mouse.move(c.x + Math.sin(a) * r, c.y - Math.cos(a) * r); await delay(16); }
  await page.mouse.up(); await delay(100);
  return page.evaluate(() => { const d = window.m7drag; d.running = false; d.mo.disconnect(); d.po.disconnect(); const s = a => { const v = [...a].sort((x, y) => x - y); return { count: v.length, p50: v[Math.floor(v.length * .5)], p95: v[Math.floor(v.length * .95)], max: v.at(-1) }; };
    return { eventToFrameMs: s(d.events), commitToFrameProxyMs: s(d.commits), frameIntervalMs: s(d.frames.slice(1).map((t, i) => t - d.frames[i])), longTasksMs: d.longTasks, outsideMoves: d.outside, capturedOutsideMoves: d.captured }; });
}

async function waitNoInstance() {
  for (let n = 0; n < 60; n++) { const r = await ps(`@(Get-Process longitude -ErrorAction SilentlyContinue).Count|ConvertTo-Json`); if (!r) return; await delay(1000); }
  throw Error('A previous Longitude instance is still running');
}

async function trial(round, { exe, observer }) {
  await waitNoInstance();
  const env = { ...process.env }; delete env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS;
  if (observer !== 'noport') env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1`;
  const result = { round, exe, observer, executable: exes[exe], startedAt: new Date().toISOString(), errors: [] };
  const child = spawn(exes[exe], [], { windowsHide: false, env });
  let browser, page, session;
  const detach = async () => { await browser?.close(); browser = page = session = undefined; if (child.exitCode !== null) throw Error('Disconnecting the CDP client ended the app'); };
  try {
    if (observer === 'noport') { await delay(5000); if (child.exitCode !== null) throw Error('Instance exited at launch'); result.mount = 'unverified (no debug endpoint)'; }
    else { ({ browser, page } = await attach(child)); result.conditionsAtMount = await conditions(page); }
    result.hostBefore = await hostState();
    if (observer === 'detached') await detach();
    await delay(warmup * 1000);
    const metrics = observer === 'attached' ? async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value])) : undefined;
    if (observer === 'attached') { session = await page.context().newCDPSession(page); await session.send('Performance.enable'); result.frameProbeBeforeLive = await frameProbe(page); }
    result.live = await idleWindow(child.pid, 'live', metrics);
    if (observer !== 'noport') {
      if (observer === 'detached') { ({ browser, page } = await attach(child)); result.frameProbeAfterLive = await frameProbe(page); }
      await page.locator('.lg-dial').press('ArrowRight'); result.conditionsPlanning = await conditions(page);
      if (observer === 'detached') { await detach(); await delay(10000); } else await delay(1000);
      result.planning = await idleWindow(child.pid, 'planning', metrics);
      if (observer === 'detached') ({ browser, page } = await attach(child));
      result.frameProbeAfterPlanning = await frameProbe(page);
      result.drag = await drag(page);
      await page.locator('.lg-dial').press('Home');
    }
    result.hostAfter = await hostState();
  } catch (error) { result.errors.push(String(error?.stack ?? error)); }
  finally {
    if (page) await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('longitude_window', { action: 'quit' })).catch(() => {});
    await browser?.close().catch(() => {});
    for (let n = 0; n < 10 && child.exitCode === null; n++) await delay(500);
    if (child.exitCode === null) { result.forcedExit = true; await exec('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => {}); }
    result.finishedAt = new Date().toISOString();
  }
  return result;
}

const stats = values => { const v = values.filter(x => typeof x === 'number').sort((a, b) => a - b); if (!v.length) return null; const q = p => v[Math.min(v.length - 1, Math.floor((v.length - 1) * p + .5))]; return { n: v.length, median: q(.5), q1: q(.25), q3: q(.75), min: v[0], max: v.at(-1) }; };
function summarize(trials) {
  const groups = {};
  for (const t of trials.filter(t => !t.errors.length)) (groups[`${t.exe}:${t.observer}`] ??= []).push(t);
  const mode = (ts, m) => {
    const roles = [...new Set(ts.flatMap(t => Object.keys(t[m]?.cpuByRolePercent ?? {})))];
    return { cpuPercent: stats(ts.map(t => t[m]?.totalMachineCpuPercent)), privateMiB: stats(ts.map(t => t[m]?.peakSampledPrivateMiB)), otherLoadPercent: stats(ts.map(t => t[m]?.otherLoadPercent)), rendererTaskMsPerSecond: stats(ts.map(t => t[m]?.rendererTaskMsPerSecond)),
      byRole: Object.fromEntries(roles.map(r => [r, stats(ts.map(t => t[m]?.cpuByRolePercent[r] ?? 0))])) };
  };
  const group = ts => {
    const g = {};
    for (const m of ['live', 'planning']) if (ts.some(t => t[m])) g[m] = mode(ts, m);
    g.dragFrameP95 = stats(ts.map(t => t.drag?.frameIntervalMs.p95));
    g.commitProxyP95 = stats(ts.map(t => t.drag?.commitToFrameProxyMs.p95));
    g.idleFrameP50 = stats(ts.map(t => t.frameProbeAfterPlanning?.p50));
    return g;
  };
  return Object.fromEntries(Object.entries(groups).map(([k, ts]) => [k, group(ts)]));
}

await mkdir(out, { recursive: true });
const hashes = Object.fromEntries(await Promise.all(Object.entries(exes).map(async ([l, p]) => [l, await sha(p)])));
const hardware = await ps('[pscustomobject]@{cpu=@(Get-CimInstance Win32_Processor|Select-Object Name,NumberOfCores,NumberOfLogicalProcessors);system=(Get-CimInstance Win32_ComputerSystem|Select-Object Manufacturer,Model,TotalPhysicalMemory);os=(Get-CimInstance Win32_OperatingSystem|Select-Object Caption,Version,BuildNumber)}|ConvertTo-Json -Depth 5 -Compress');
const trials = [], file = resolve(out, `trials-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const save = () => writeFile(file, JSON.stringify({ method: { rounds, warmupSeconds: warmup, windowSeconds, sampleEverySeconds: sampleEvery, order: 'configs rotated by one position each round', configs }, executables: Object.fromEntries(Object.entries(exes).map(([l, p]) => [l, { path: p, sha256: hashes[l] }])), hardware, cores, summary: summarize(trials), trials,
  limitations: ['Process CPU is last observed per process minus its first sample; work between samples by processes that exit is missed', 'Machine busy percent is from Node os.cpus() and includes the sampler', 'noport trials cannot verify mount or enter planning mode', 'Frame probes are rAF intervals, not input-to-photon latency', 'Shared desktop: user input and other applications are recorded, not prevented'] }, null, 2) + '\n');
console.log(`M7.0 trials: ${rounds} rounds x ${configs.length} configs -> ${file}`);
for (let round = 0; round < rounds; round++) for (let i = 0; i < configs.length; i++) {
  const config = configs[(i + round) % configs.length];
  console.log(`[${new Date().toISOString()}] round ${round + 1}/${rounds} ${config.exe}:${config.observer}`);
  const t = await trial(round, config); trials.push(t); await save();
  console.log(t.errors.length ? `  ERROR ${t.errors[0].split('\n')[0]}` : `  live ${t.live?.totalMachineCpuPercent.toFixed(3)}% planning ${t.planning?.totalMachineCpuPercent?.toFixed(3) ?? '-'}% other ${t.live?.otherLoadPercent.toFixed(2)}% idle-frame-p50 ${t.frameProbeAfterPlanning?.p50 ?? '-'}`);
}
console.log(JSON.stringify(summarize(trials), null, 2));
