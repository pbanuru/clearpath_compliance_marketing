import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { launchBrowser } from './lib/browser.mjs';

export async function generateBoxes(sourceDir, caseId) {
  const keyDir = new URL('./answer-key/', import.meta.url);
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    for (const name of (await readdir(keyDir)).filter((name) => name.endsWith('.json'))) {
      if (caseId && name !== `${caseId}.json`) continue;
      const file = new URL(name, keyDir);
      const key = JSON.parse(await readFile(file, 'utf8'));
      for (const issue of key.issues)
        for (const anchor of issue.anchors) {
          if (!anchor.source) continue;
          const { html, selector, canvas } = anchor.source;
          const htmlPath = resolve(sourceDir, html);
          await page.setViewport({ ...(anchor.source.viewport ?? canvas), deviceScaleFactor: 1 });
          await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle0' });
          await page.evaluate(() => document.fonts.ready);
          const element = await page.$(selector);
          if (!element) throw new Error(`Missing ${selector} in ${html}`);
          const box = await element.boundingBox();
          if (!box) throw new Error(`No bounding box for ${selector}`);
          anchor.region = {
            x: box.x / canvas.width,
            y: box.y / canvas.height,
            width: box.width / canvas.width,
            height: box.height / canvas.height,
          };
          anchor.source.sha256 = createHash('sha256')
            .update(await readFile(htmlPath))
            .digest('hex');
        }
      await writeFile(file, `${JSON.stringify(key, null, 2)}\n`);
    }
  } finally {
    await browser.close();
  }
}
