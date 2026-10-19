import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { scenarios } from '../tests/browser/scenarios.mjs';
const milestone = process.argv[2] ?? 'milestone-2';
const followup = milestone === 'milestone-5b-followup';
if (!/^milestone-(?:[2346]|5[ab])$/.test(milestone) && !followup) throw new Error('Unsupported milestone');
const root = `docs/evidence/${milestone}/visual`;
const number = followup ? '5B follow-up' : milestone.endsWith('5b') ? '5B' : milestone.endsWith('5a') ? '5A' : Number(milestone.at(-1));
const previous = milestone === 'milestone-6' ? '5B' : followup ? '5B' : number === '5B' ? '5A' : number === '5A' ? 4 : number - 1;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
const comparisons = [];
try {
  for (const scenario of scenarios) {
    const before = (await readFile(`${root}/before/${scenario.name}.png`)).toString('base64');
    const after = (await readFile(`${root}/after/${scenario.name}.png`)).toString('base64');
    const result = await page.evaluate(async ({ before, after }) => {
      const pixels = async (data) => {
        const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
      };
      const a = await pixels(before), b = await pixels(after);
      if (a.width !== b.width || a.height !== b.height) throw new Error('Image sizes differ');
      let changed = 0, minX = a.width, minY = a.height, maxX = -1, maxY = -1;
      for (let i = 0; i < a.data.length; i += 4) {
        if ([0, 1, 2, 3].some(channel => Math.abs(a.data[i + channel] - b.data[i + channel]) > 16)) {
          changed++; const x = i / 4 % a.width, y = Math.floor(i / 4 / a.width);
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        }
      }
      return { width: a.width, height: a.height, changedPixels: changed, changedPercent: changed / (a.width * a.height) * 100,
        bounds: changed ? { minX, minY, maxX, maxY } : null };
    }, { before, after });
    comparisons.push({ name: scenario.name, ...result });
  }
  await writeFile(`${root}/comparison.json`, JSON.stringify({ browser: browser.version(), method: 'Canvas decoded RGBA; any channel difference >16. Strict Playwright perceptual assertions are separate.', comparisons }, null, 2) + '\n');
  let content = comparisons.map(c => `<section><h2>${c.name}</h2><p>${c.changedPixels} changed pixels (${c.changedPercent.toFixed(4)}%); bounds ${JSON.stringify(c.bounds)}</p><div><figure><figcaption>Before — Milestone ${previous}</figcaption><img src="before/${c.name}.png" alt="Before ${c.name}"></figure><figure><figcaption>After — Milestone ${number}</figcaption><img src="after/${c.name}.png" alt="After ${c.name}"></figure></div></section>`).join('\n');
  if (number === 6) content += [380, 850].map(width => `<section><h2>Sharing at ${width}px</h2><p>Intentional functional additions; review visually, excluded from unchanged-view pixel totals. After-actions view scrolls the existing bounded modal to its footer.</p><div>${['before','after'].map(side => `<figure><figcaption>${side}</figcaption><img src="${side}/share-${width}.png" alt="${side} sharing at ${width}px"></figure>`).join('')}<figure><figcaption>After: action footer</figcaption><img src="after/share-${width}-actions.png" alt="Sharing actions at ${width}px"></figure></div></section>`).join('\n');
  await writeFile(`${root}/index.html`, `<!doctype html><html lang="en"><meta charset="UTF-8"><title>Longitude Milestone ${number} visual comparisons</title><style>body{font:14px system-ui;background:#ddd;color:#222;margin:24px}section{margin-bottom:32px}section>div{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0}img{max-width:100%;border:1px solid #888}figcaption{padding:8px 0}</style><h1>Longitude Milestone ${number} visual comparisons</h1><p>Fixed instants, viewports and fonts; same installed Edge. See docs/MILESTONE_${number}.md for intended correctness/control changes and review.</p>${content}</html>`);
  console.log(JSON.stringify(comparisons, null, 2));
} finally { await browser.close(); }
