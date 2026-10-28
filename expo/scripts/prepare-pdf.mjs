// Keep the worker, fonts, CMaps and WASM in sync with the installed renderer.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('pdfjs-dist/package.json'));
const { version } = require('pdfjs-dist/package.json');
const root = resolve(import.meta.dirname, '../public/pdfjs');
rmSync(root, { recursive: true, force: true });
const target = resolve(root, version);
mkdirSync(target, { recursive: true });
for (const part of ['build/pdf.worker.min.mjs', 'cmaps', 'standard_fonts', 'wasm']) {
  cpSync(resolve(source, part), resolve(target, part), { recursive: true });
}
