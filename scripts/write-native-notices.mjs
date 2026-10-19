import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// Include all lockfile targets, so this inventory does not silently omit
// platform-specific transitive licenses. This is not a macOS build claim.
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--manifest-path', 'src-tauri/Cargo.toml', '--locked', '--format-version', '1'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
let text = 'Longitude native third-party notices\nGenerated from the pinned Cargo graph, including platform-specific/build packages.\nApplication code has no selected open-source license.\n\n';
for (const pkg of metadata.packages.filter(pkg => pkg.name !== 'longitude').sort((a,b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))) {
  text += `\n${'='.repeat(72)}\n${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? 'SEE PACKAGE LICENSE'}\nRepository: ${pkg.repository ?? pkg.source}\n`;
  const directory = dirname(pkg.manifest_path);
  const files = readdirSync(directory, { withFileTypes: true }).filter(file => file.isFile() && /^(licen[cs]e|copying|copyright|notice)(?:[._-]|$)/i.test(file.name));
  for (const file of files) text += `\n--- ${file.name} ---\n${readFileSync(join(directory,file.name),'utf8')}\n`;
}
writeFileSync('docs/NATIVE_THIRD_PARTY_NOTICES.txt',text);
console.log(`Wrote native notices for ${metadata.packages.length - 1} resolved package entries`);
