// Run on the macOS build host; records actual artifact/OS/signature evidence.
// A successful build is deliberately not a runtime or distribution acceptance.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, readdir, mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
if (process.platform !== 'darwin') throw Error('macOS artifact inspection requires macOS');
const target = process.argv[2];
if (!['aarch64-apple-darwin', 'x86_64-apple-darwin'].includes(target)) throw Error('Expected a declared macOS architecture');
const root = resolve('src-tauri/target', target, 'release/bundle');
const output = resolve('ci-results'); await mkdir(output, { recursive: true });
const app = join(root, 'macos/Longitude.app');
await stat(app);
const binary = join(app, 'Contents/MacOS/longitude');
const command = (name, args) => { const p = spawnSync(name, args, { encoding: 'utf8' }); return { exitCode: p.status, stdout: p.stdout, stderr: p.stderr, error: p.error?.message }; };
const signatures = command('codesign', ['--display', '--verbose=4', app]);
const verification = command('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
const gatekeeper = command('spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
const metadata = command('plutil', ['-p', join(app, 'Contents/Info.plist')]);
const architecture = command('file', [binary]);
if (architecture.exitCode !== 0 || !architecture.stdout.includes(target.startsWith('aarch64') ? 'arm64' : 'x86_64')) throw Error('Bundle architecture does not match requested target');
execFileSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, join(output, `Longitude-${target}-development.app.zip`)]);
const dmg = (await readdir(join(root, 'dmg'))).filter(f => f.endsWith('.dmg'));
if (!dmg.length) throw Error('Expected development DMG was not generated');
for (const file of dmg) execFileSync('hdiutil', ['verify', join(root, 'dmg', file)], { stdio: 'inherit' });
const files = [binary, join(output, `Longitude-${target}-development.app.zip`), ...dmg.map(f => join(root, 'dmg', f))];
const artifacts = await Promise.all(files.map(async path => ({ path, bytes: (await stat(path)).size, sha256: createHash('sha256').update(await readFile(path)).digest('hex') })));
await writeFile(join(output, 'macos-artifacts.json'), JSON.stringify({ target, host: command('sw_vers', []), hardware: command('sysctl', ['hw.model', 'hw.memsize', 'hw.ncpu']), arch: command('uname', ['-m']), binary: architecture, signatures, verification, gatekeeper, metadata, artifacts, runtimeVerified: false, notarized: false, releaseReady: false, note: 'Development artifacts only. Signature/Gatekeeper output is evidence; no credentials are configured and rejection is expected. No app launch or physical-hardware verification is implied. Hardware capture excludes serial numbers and device UUIDs.' }, null, 2) + '\n');
