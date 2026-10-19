import { readFile, writeFile, readdir, mkdir, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const sections = ['Longitude third-party runtime notices\nGenerated from the pinned npm lockfile. Project license not selected.\n'];
for (const [directory, dependency] of Object.entries(lock.packages)) {
  if (!directory || dependency.dev) continue;
  const metadata = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
  const files = (await readdir(directory)).filter((file) => /^(license|licence|copying|notice)(\.[a-z]+)?$/i.test(file));
  if (!files.length) throw new Error(`Missing license notice for ${metadata.name}`);
  const notices = await Promise.all(files.map((file) => readFile(resolve(directory, file), 'utf8')));
  sections.push(`${metadata.name} ${dependency.version} — ${metadata.license}\n${notices.join('\n')}`);
}
await mkdir('docs', { recursive: true });
const path = 'docs/THIRD_PARTY_NOTICES.txt';
await writeFile(path, sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n');
for (const directory of ['dist', 'prototype-dist']) {
  if (process.argv.includes(`--${directory}`)) await copyFile(path, `${directory}/THIRD_PARTY_NOTICES.txt`);
}
console.log(`Wrote ${path} (${sections.length - 1} runtime packages)`);
