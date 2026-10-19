import { execFileSync } from 'node:child_process';
// Invoke Node entry points directly: nested npm/.cmd shells can fail to spawn
// under Windows process load. This is the same strict frontend build, portable
// across hosts, followed by the required packaged notices.
for (const [entry, ...args] of [
  ['node_modules/typescript/bin/tsc', '--noEmit'],
  ['node_modules/vite/bin/vite.js', 'build'],
  ['scripts/write-notices.mjs', '--dist'],
  ['scripts/write-native-notices.mjs'],
]) execFileSync(process.execPath, [entry, ...args], { stdio: 'inherit' });
