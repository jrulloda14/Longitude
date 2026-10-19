import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { scenarios } from '../tests/browser/scenarios.mjs';
const root = 'docs/evidence/milestone-2/visual';
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
  const content = comparisons.map(c => `<section><h2>${c.name}</h2><p>${c.changedPixels} changed pixels (${c.changedPercent.toFixed(4)}%); bounds ${JSON.stringify(c.bounds)}</p><div><figure><figcaption>Before — Milestone 1</figcaption><img src="before/${c.name}.png" alt="Before ${c.name}"></figure><figure><figcaption>After — Milestone 2</figcaption><img src="after/${c.name}.png" alt="After ${c.name}"></figure></div></section>`).join('\n');
  await writeFile(`${root}/index.html`, `<!doctype html><html lang="en"><meta charset="UTF-8"><title>Longitude Milestone 2 visual comparisons</title><style>body{font:14px system-ui;background:#ddd;color:#222;margin:24px}section{margin-bottom:32px}section>div{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0}img{max-width:100%;border:1px solid #888}figcaption{padding:8px 0}</style><h1>Longitude Milestone 2 visual comparisons</h1><p>Fixed instants, viewports and fonts; same installed Edge. DST geometry changes are intentional. See MILESTONE_2.md for review.</p>${content}</html>`);
  console.log(JSON.stringify(comparisons, null, 2));
} finally { await browser.close(); }
