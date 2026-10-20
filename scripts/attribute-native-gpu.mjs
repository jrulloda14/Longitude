// M7.1 diagnostic attribution of live-mode GPU-process CPU. Each launch records
// the WebView2 GPU configuration, then measures consecutive windows while
// temporarily toggling one animation factor at a time through the debugger.
// Toggles are runtime-only and restored before the next window; no shipped
// code, style or animation changes.
//
// Usage: node scripts/attribute-native-gpu.mjs [--launches=10] [--warmup=60] [--window=60]
//   [--exe=path] [--display=on|leave] [--flags="--extra-webview2-flag ..."] [--out=dir]
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { port, cores, exec, sha, keepDisplayOn, hostState, attach, frameProbe, conditions, idleWindow, waitNoInstance, stats } from './lib/native-measure.mjs';

const arg = (name, fallback) => process.argv.slice(2).find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const launches = Number(arg('launches', '10')), warmup = Number(arg('warmup', '60')), windowSeconds = Number(arg('window', '60'));
const executable = resolve(arg('exe', 'src-tauri/target/release/longitude.exe')), display = arg('display', 'on'), flags = arg('flags', '');
const out = resolve(arg('out', `${process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-7'}/gpu-attribution`));

const toggles = {
  pausePulse: () => document.querySelectorAll('.lg-pulse').forEach(e => e.getAnimations().forEach(a => a.pause())),
  playPulse: () => document.querySelectorAll('.lg-pulse').forEach(e => e.getAnimations().forEach(a => a.play())),
  staticHands: () => document.querySelectorAll('.lg-hand-anim').forEach(e => { e.style.transition = 'none'; }),
  animatedHands: () => document.querySelectorAll('.lg-hand-anim').forEach(e => { e.style.transition = ''; }),
};
const windows = [
  { name: 'live', before: [] },
  { name: 'live-pulse-paused', before: ['pausePulse'] },
  { name: 'live-pulse-paused-static-hands', before: ['staticHands'] },
  { name: 'live-restored', before: ['playPulse', 'animatedHands'] },
  { name: 'planning', before: [], planning: true },
];

async function gpuInfo(browser) {
  const session = await browser.newBrowserCDPSession();
  const { gpu } = await session.send('SystemInfo.getInfo');
  const aux = Object.fromEntries(Object.entries(gpu.auxAttributes ?? {}).filter(([k]) => /overlay|composit|vsync|dxgi|swap|d3d|hdr|gl(Renderer|Version|ImplementationParts)|initializationTime|passthrough/i.test(k)));
  await session.detach();
  return { featureStatus: gpu.featureStatus, driverBugWorkarounds: gpu.driverBugWorkarounds?.length ?? 0, devices: gpu.devices?.map(d => ({ vendorId: d.vendorId, deviceId: d.deviceId, driverVersion: d.driverVersion })), aux };
}

async function launch(index) {
  await waitNoInstance();
  const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1 ${flags}`.trim() };
  const result = { index, flags, startedAt: new Date().toISOString(), errors: [], windows: {} };
  const child = spawn(executable, [], { windowsHide: false, env });
  let browser, page;
  try {
    ({ browser, page } = await attach(child));
    result.gpu = await gpuInfo(browser);
    result.conditionsAtMount = await conditions(page);
    result.hostBefore = await hostState();
    const session = await page.context().newCDPSession(page); await session.send('Performance.enable');
    const raw = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    await delay(warmup * 1000);
    for (const w of windows) {
      for (const t of w.before) await page.evaluate(toggles[t]);
      if (w.planning) await page.locator('.lg-dial').press('ArrowRight');
      await delay(2000);
      const m0 = await raw();
      const measured = await idleWindow(child.pid, w.name, raw, windowSeconds);
      const m1 = await raw(), s = measured.elapsedSeconds;
      result.windows[w.name] = { cpuPercent: measured.totalMachineCpuPercent, cpuByRolePercent: measured.cpuByRolePercent, rendererTaskMsPerSecond: measured.rendererTaskMsPerSecond,
        styleRecalcsPerSecond: (m1.RecalcStyleCount - m0.RecalcStyleCount) / s, layoutsPerSecond: (m1.LayoutCount - m0.LayoutCount) / s, otherLoadPercent: measured.otherLoadPercent, stableProcessSet: measured.stableProcessSet,
        runningAnimations: await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length) };
    }
    result.frameProbePlanning = await frameProbe(page);
    await page.locator('.lg-dial').press('Home');
    result.hostAfter = await hostState();
  } catch (error) { result.errors.push(String(error?.stack ?? error)); }
  finally {
    if (page) await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('longitude_window', { action: 'quit' })).catch(() => {});
    await browser?.close().catch(() => {});
    for (let n = 0; n < 10 && child.exitCode === null; n++) await delay(500);
    if (child.exitCode === null) { result.forcedExit = true; await exec('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => {}); }
  }
  return result;
}

// Classify each launch by its unmodified live-window GPU cost (M7.0 saw a gap
// between about 0.3% and 1.0%), then compare factors within each state.
function summarize(results) {
  const ok = results.filter(r => !r.errors.length);
  const gpu = (r, w) => r.windows[w]?.cpuByRolePercent['gpu-process'] ?? 0;
  const state = r => gpu(r, 'live') >= 0.6 ? 'high' : 'low';
  const out = {};
  for (const s of ['low', 'high']) {
    const rs = ok.filter(r => state(r) === s); if (!rs.length) continue;
    out[s] = { launches: rs.length, windows: Object.fromEntries(windows.map(w => [w.name, { cpu: stats(rs.map(r => r.windows[w.name]?.cpuPercent)), gpu: stats(rs.map(r => gpu(r, w.name))), renderer: stats(rs.map(r => r.windows[w.name]?.cpuByRolePercent.renderer ?? 0)), styleRecalcsPerSecond: stats(rs.map(r => r.windows[w.name]?.styleRecalcsPerSecond)) }])) };
  }
  out.launchStates = ok.map(r => ({ index: r.index, state: state(r), featureStatus: r.gpu?.featureStatus, aux: r.gpu?.aux }));
  return out;
}

await mkdir(out, { recursive: true });
const keeper = display === 'on' ? keepDisplayOn() : null;
const sha256 = await sha(executable), results = [];
const file = resolve(out, `attribution-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const save = () => writeFile(file, JSON.stringify({ method: { launches, warmupSeconds: warmup, windowSeconds, windows: windows.map(w => w.name), display: display === 'on' ? 'kept on (wake + SetThreadExecutionState display-required)' : 'left to power settings', flags, cores }, executable, sha256, summary: summarize(results), results,
  limitations: ['Toggles are runtime diagnostics through the debugger, not shipped changes', 'Windows within a launch are sequential; drift is checked by the live-restored window', 'Process CPU is a sampled estimate; GPU-process CPU is not GPU hardware utilization'] }, null, 2) + '\n');
try {
  console.log(`M7.1 attribution: ${launches} launches, display ${display} -> ${file}`);
  for (let i = 0; i < launches; i++) {
    const r = await launch(i); results.push(r); await save();
    console.log(`[${new Date().toISOString()}] launch ${i + 1}/${launches} ` + (r.errors.length ? `ERROR ${r.errors[0].split('\n')[0]}` : windows.map(w => `${w.name} ${r.windows[w.name].cpuPercent.toFixed(2)}%/gpu ${(r.windows[w.name].cpuByRolePercent['gpu-process'] ?? 0).toFixed(2)}`).join(' | ')));
  }
} finally { keeper?.kill(); }
console.log(JSON.stringify(summarize(results), null, 2).slice(0, 4000));
