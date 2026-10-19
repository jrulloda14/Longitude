import * as esbuild from 'esbuild';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
const out = process.argv[2] || 'dist';
fs.mkdirSync(out, { recursive: true });
await esbuild.build({ entryPoints: ['src/scheduling/search.worker.ts'], bundle: true, format: 'esm', minify: true, target: 'es2020', outfile: `${out}/search-worker.js` });
await esbuild.build({
  entryPoints: ['src/index.tsx'], bundle: true, format: 'iife', globalName: 'Longitude', minify: true, target: 'es2020',
  define: { 'import.meta.url': 'undefined' },
  jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  alias: { react: './src/shims/react.js', 'react-dom': './src/shims/react-dom.js' },
  outfile: `${out}/bundle.raw.js`, legalComments: 'none', charset: 'utf8',
});
let js = fs.readFileSync(`${out}/bundle.raw.js`, 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '\\x3C!--');
const comps = ['InteractiveClock','ClockHand','TimeReadout','TimezoneRow','TimezoneList','TimezoneSearch','TimezoneGroupSelector','TimezoneTimeline','MeetingOverlapIndicator','MeetingSummary','CompactWidget','SettingsPanel','Onboarding','EmptyState','DstNotice','TitleBar','LongitudeApp','PrototypeWindow'];
const header = `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace: 'Longitude', components: comps.map((name) => ({ name })) })} */\n`;
fs.writeFileSync(`${out}/bundle.js`, header + js + '\nwindow.Longitude = Longitude;\n');
fs.rmSync(`${out}/bundle.raw.js`);
execSync(`npx tailwindcss -i src/styles.css -o ${out}/bundle.css --minify`, { stdio: 'inherit' });
// tailwind keeps @import at top? inline it to be safe
let css = fs.readFileSync(`${out}/bundle.css`, 'utf8');
if (css.includes('@import')) { css = css.replace(/@import\s+['"]\.\/tokens\.fallback\.css['"];?/, fs.readFileSync('src/tokens.fallback.css', 'utf8')); }
fs.writeFileSync(`${out}/bundle.css`, css);
console.log('bundle.js', (fs.statSync(`${out}/bundle.js`).size / 1024).toFixed(0) + 'K', 'bundle.css', (css.length / 1024).toFixed(0) + 'K', /<\/style/i.test(css) ? 'CSS-HAS-STYLE-CLOSE' : '');
