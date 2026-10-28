import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { launchBrowser } from './lib/browser.mjs';

// Freeze the real URL-capture renderer's output from self-contained example sites.
// No model calls. The resulting fixture is uploaded through assets.createWebpage.
export async function prepareWebpages(sourceDir, captureRoot) {
  if (!captureRoot) throw new Error('--capture-source must name the DEV union checkout.');
  const sources = ['expo/worker/capturePage.ts', 'backend/convex/webpageBlocks.ts'];
  const sourceHashes = {};
  let source = '';
  for (const path of sources) {
    const content = await readFile(resolve(captureRoot, path), 'utf8');
    sourceHashes[path] = createHash('sha256').update(content).digest('hex');
    source += content.replace(/^import .+;\n/gm, '') + '\n';
  }
  const code = ts.transpile(source, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  });
  const { renderCapture } = await import(
    `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
  );
  const base = resolve(sourceDir);
  const server = createServer(async (request, response) => {
    try {
      const path = resolve(base, `.${new URL(request.url, 'http://localhost').pathname}`);
      if (!path.startsWith(`${base}/`)) throw new Error('Outside fixture directory.');
      const types = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.jpg': 'image/jpeg',
      };
      response.writeHead(200, {
        'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      });
      response.end(await readFile(path));
    } catch (error) {
      response.writeHead(404);
      response.end(error.message);
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    for (const id of ['advertorial', 'landing']) {
      const sourceUrl = `http://127.0.0.1:${server.address().port}/sites/${id}/index.html`;
      const capturedAt = Date.now();
      const captured = await renderCapture(page, sourceUrl);
      const { screenshot, ...metadata } = captured;
      const file = new URL(`./cases/addendum/${id}`, import.meta.url);
      await writeFile(`${file.pathname}.jpg`, Buffer.from(screenshot.split(',')[1], 'base64'));
      await writeFile(
        `${file.pathname}.capture`,
        JSON.stringify({
          ...metadata,
          sourceUrl,
          browserMs: Date.now() - capturedAt,
          capturedAt,
          screenshot: `evals/cases/addendum/${id}.jpg`,
          provenance: {
            renderer: 'DEV union renderCapture; local Chrome',
            sourceHashes,
            htmlSha256: createHash('sha256')
              .update(await readFile(resolve(base, `sites/${id}/index.html`)))
              .digest('hex'),
          },
        }) + '\n',
      );
      console.info(
        `${id}: ${metadata.size.width} × ${metadata.size.height}; ${metadata.blocks.length} DOM blocks`,
      );
    }
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
