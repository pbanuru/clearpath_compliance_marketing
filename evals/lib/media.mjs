import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { launchBrowser } from './browser.mjs';

// Execute the upload flow's actual videoPoster and visibility/decoder helpers.
// No hand-picked frames, prewritten transcript, or eval-specific sampling.
export async function captureVideo(root, videoPath) {
  const base = resolve(root, 'expo/src/features/assets');
  const helper = await readFile(resolve(base, 'videoCapture.ts'), 'utf8');
  const media = await readFile(resolve(base, 'media.ts'), 'utf8');
  const body = media.slice(media.indexOf('export async function videoPoster'));
  const script = ts
    .transpile(`${helper}\n${body}`, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    })
    .replaceAll('export ', '');
  const bytes = await readFile(videoPath);
  const server = createServer((request, response) => {
    if (request.url === '/video') {
      response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': bytes.length });
      response.end(bytes);
    } else {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end('<!doctype html><html><body>Eval video capture</body></html>');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.addScriptTag({ content: script });
    const frames = await page.evaluate(async () => {
      const file = new File([await (await fetch('/video')).blob()], 'affiliate-video.mp4', {
        type: 'video/mp4',
      });
      // The function is injected from the app's TypeScript source above.
      const captured = await window.videoPoster(file);
      return Promise.all(
        captured.frames.map(async ({ blob, at }) => ({
          at,
          bytes: Array.from(new Uint8Array(await blob.arrayBuffer())),
        })),
      );
    });
    return frames.map(({ at, bytes }) => ({ at, bytes: Buffer.from(bytes) }));
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}
