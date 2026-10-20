// M7 diagnostic: cost of the "Live" pulse under visually similar variants.
// Each launch applies exactly one runtime-only variant at mount (toggling the
// pulse within a launch can shift the compositor into a costlier state), then
// measures one live window. No shipped code or style changes.
//
// Usage: node scripts/attribute-native-pulse.mjs [--rounds=3] [--warmup=60] [--window=90]
//   [--exe=path] [--variants=shipped,paused,stepped,js10,layer] [--display=on|leave] [--out=dir]
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { port, cores, exec, sha, keepDisplayOn, hostState, attach, conditions, idleWindow, waitNoInstance, stats } from './lib/native-measure.mjs';

const arg = (name, fallback) => process.argv.slice(2).find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const rounds = Number(arg('rounds', '3')), warmup = Number(arg('warmup', '60')), windowSeconds = Number(arg('window', '90'));
const executable = resolve(arg('exe', 'src-tauri/target/release/longitude.exe')), display = arg('display', 'on');
const variants = arg('variants', 'shipped,paused,stepped,js10,layer').split(',');
const out = resolve(arg('out', `${process.env.LONGITUDE_EVIDENCE_ROOT ?? 'docs/evidence/milestone-7'}/pulse-attribution`));

// Applied once in the page. The shipped keyframes fade opacity 1 → 0.35 → 1
// over 1.6 s with ease-in-out; variants keep that curve and period.
const apply = {
  shipped: () => {},
  paused: () => document.querySelectorAll('.lg-pulse').forEach(e => e.getAnimations().forEach(a => a.pause())),
  stepped: () => document.querySelectorAll('.lg-pulse').forEach(e => { e.style.animationTimingFunction = 'steps(8, jump-none)'; }),
  js10: () => document.querySelectorAll('.lg-pulse').forEach(e => {
    e.style.animation = 'none'; const t0 = performance.now();
    setInterval(() => { const p = ((performance.now() - t0) / 1600) % 1; e.style.opacity = String(1 - 0.65 * (1 - Math.cos(2 * Math.PI * p)) / 2); }, 100);
  }),
  layer: () => document.querySelectorAll('.lg-pulse').forEach(e => { e.style.willChange = 'opacity'; }),
};

async function launch(round, variant) {
  await waitNoInstance();
  const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port} --remote-debugging-address=127.0.0.1` };
  const result = { round, variant, startedAt: new Date().toISOString(), errors: [] };
  const child = spawn(executable, [], { windowsHide: false, env });
  let browser, page;
  try {
    ({ browser, page } = await attach(child));
    await page.evaluate(apply[variant]);
    result.pulse = await page.evaluate(() => [...document.querySelectorAll('.lg-pulse')].map(e => ({ animations: e.getAnimations().map(a => a.playState), timing: getComputedStyle(e).animationTimingFunction, willChange: getComputedStyle(e).willChange })));
    result.conditions = await conditions(page);
    result.hostBefore = await hostState();
    const session = await page.context().newCDPSession(page); await session.send('Performance.enable');
    const raw = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
    await delay(warmup * 1000);
    const m0 = await raw(), w = await idleWindow(child.pid, 'live', raw, windowSeconds), m1 = await raw();
    result.live = { cpuPercent: w.totalMachineCpuPercent, cpuByRolePercent: w.cpuByRolePercent, rendererTaskMsPerSecond: w.rendererTaskMsPerSecond, styleRecalcsPerSecond: (m1.RecalcStyleCount - m0.RecalcStyleCount) / w.elapsedSeconds, otherLoadPercent: w.otherLoadPercent, stableProcessSet: w.stableProcessSet };
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

const summarize = rs => Object.fromEntries(variants.map(v => { const ok = rs.filter(r => r.variant === v && !r.errors.length); return [v, { n: ok.length, cpu: stats(ok.map(r => r.live.cpuPercent)), gpu: stats(ok.map(r => r.live.cpuByRolePercent['gpu-process'] ?? 0)), renderer: stats(ok.map(r => r.live.cpuByRolePercent.renderer ?? 0)), rendererTaskMsPerSecond: stats(ok.map(r => r.live.rendererTaskMsPerSecond)) }]; }));

await mkdir(out, { recursive: true });
const keeper = display === 'on' ? keepDisplayOn() : null;
const sha256 = await sha(executable), results = [];
const file = resolve(out, `pulse-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
const save = () => writeFile(file, JSON.stringify({ method: { rounds, warmupSeconds: warmup, windowSeconds, variants, order: 'variants rotated by one position each round', display, cores }, executable, sha256, summary: summarize(results), results,
  limitations: ['Variants are runtime diagnostics, not shipped changes', 'One live window per launch; whole-machine CPU includes outside load (see otherLoadPercent and hostBefore.userIdleSeconds)', 'GPU-process CPU is not GPU hardware utilization'] }, null, 2) + '\n');
try {
  console.log(`Pulse attribution: ${rounds} rounds x ${variants.length} variants -> ${file}`);
  for (let round = 0; round < rounds; round++) for (let i = 0; i < variants.length; i++) {
    const v = variants[(i + round) % variants.length], r = await launch(round, v); results.push(r); await save();
    console.log(`[${new Date().toISOString()}] round ${round + 1} ${v.padEnd(8)} ` + (r.errors.length ? `ERROR ${r.errors[0].split('\n')[0]}` : `cpu ${r.live.cpuPercent.toFixed(2)} gpu ${(r.live.cpuByRolePercent['gpu-process'] ?? 0).toFixed(2)} renderer ${(r.live.cpuByRolePercent.renderer ?? 0).toFixed(2)} other ${r.live.otherLoadPercent.toFixed(1)} idle ${Math.round(r.hostBefore.userIdleSeconds)}s`));
  }
} finally { keeper?.kill(); }
console.log(JSON.stringify(summarize(results), null, 2));
