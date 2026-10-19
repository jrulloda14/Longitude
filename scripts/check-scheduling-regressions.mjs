import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
const baseline = 'f8edbc157cfcf3a3f9f8cd877cedd3ed6e23b962';
const source = execFileSync('git', ['show', `${baseline}:src/lib/schedule.ts`], { encoding: 'utf8' });
await mkdir('performance-results', { recursive: true });
const oldFile = resolve('performance-results/schedule-baseline.mjs'), newFile = resolve('performance-results/schedule-current.mjs');
await build({ stdin: { contents: source, loader: 'ts', resolveDir: resolve('src/lib') }, bundle: true, format: 'esm', platform: 'node', outfile: oldFile });
await build({ entryPoints: ['src/lib/schedule.ts'], bundle: true, format: 'esm', platform: 'node', outfile: newFile });
const before = await import(pathToFileURL(oldFile)), after = await import(pathToFileURL(newFile));
const p = { id: 'p', label: 'Person', zone: 'UTC', work: { start: 1320, end: 360, days: [5] }, sleep: { start: 0, end: 0 } };
const probes = [
  { defect: 'Friday overnight tail on Saturday 02:00', expected: 'work', before: before.dayState(p, Date.parse('2026-10-24T02:00Z')), after: after.dayState(p, Date.parse('2026-10-24T02:00Z')) },
  { defect: '14-minute meeting beginning 16:50 crosses 17:00 work end', expected: 'edge', before: before.stateDuring({ ...p, work: { start: 540, end: 1020, days: [2] } }, Date.parse('2026-10-20T16:50Z'), 14), after: after.stateDuring({ ...p, work: { start: 540, end: 1020, days: [2] } }, Date.parse('2026-10-20T16:50Z'), 14) },
];
for (const probe of probes) if (probe.before === probe.expected || probe.after !== probe.expected) throw new Error(`Regression comparison failed: ${probe.defect}`);
await mkdir('docs/evidence/milestone-3', { recursive: true });
await writeFile('docs/evidence/milestone-3/audit-regressions.json', JSON.stringify({ baseline, timezoneEngine: 'Current unchanged Milestone 1 time.ts for both builds', probes }, null, 2) + '\n');
console.log(JSON.stringify(probes, null, 2));
