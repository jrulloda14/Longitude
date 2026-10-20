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
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { port, cores, sampleEvery, exec, ps, sha, hostState, attach, frameProbe, conditions, idleWindow as measureWindow, drag, waitNoInstance, stats } from './lib/native-measure.mjs';

const arg = (name, fallback) => { const hit = process.argv.slice(2).filter(a => a.startsWith(`--${name}=`)).map(a => a.slice(name.length + 3)); return hit.length ? hit : fallback; };
const rounds = Number(arg('rounds', ['5'])[0]), warmup = Number(arg('warmup', ['60'])[0]), windowSeconds = Number(arg('window', ['120'])[0]);
const out = resolve(arg('out', [`${process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-7'}/native-trials`])[0]);
const exes = Object.fromEntries(arg('exe', ['m6=src-tauri/target/release/longitude.exe']).map(e => { const [label, path] = e.split('='); return [label, resolve(path)]; }));
const configs = arg('configs', [Object.keys(exes).map(l => `${l}:attached,${l}:detached,${l}:noport`).join(',')])[0].split(',').map(c => { const [exe, observer] = c.split(':'); return { exe, observer }; });
for (const c of configs) if (!exes[c.exe] || !['attached', 'detached', 'noport'].includes(c.observer)) throw Error(`Bad config ${c.exe}:${c.observer}`);
const idleWindow = (rootPid, mode, metrics) => measureWindow(rootPid, mode, metrics, windowSeconds);

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
