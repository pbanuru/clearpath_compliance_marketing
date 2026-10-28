// Renders Graphviz diagram sources (*.dot) to SVG images beside them with @viz-js/viz, Graphviz
// compiled to WebAssembly: it runs anywhere Node runs, needs no browser, and the same source gives
// the same picture on every machine. READMEs embed the SVG instead of relying on GitHub's renderers.
// The pre-commit hook runs it with --staged: each staged .dot is rendered from its staged content
// and the .svg is staged with it, so agents only ever edit the .dot. Startups keep an identical copy.
//
//   node scripts/render-diagrams.mjs --staged       pre-commit hook
//   node scripts/render-diagrams.mjs <file.dot>...  by hand
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const staged = args.includes('--staged');
const sources = staged ? stagedSources() : args.filter((arg) => arg.endsWith('.dot'));
if (sources.length === 0) process.exit(0);

// Loaded only when a diagram changed, so ordinary commits never need it.
let viz;
try {
  viz = await (await import('@viz-js/viz')).instance();
} catch (error) {
  console.error(
    `render-diagrams: can't load @viz-js/viz (${String(error)}). Run \`npm install\` first.`,
  );
  process.exit(1);
}

for (const source of sources) {
  // Render the staged content in hook mode, so a partly staged file can't mismatch its picture.
  const dot = staged
    ? execFileSync('git', ['show', `:${source}`], { encoding: 'utf8' })
    : readFileSync(source, 'utf8');
  const output = source.replace(/\.dot$/, '.svg');
  try {
    writeFileSync(output, viz.renderString(dot, { format: 'svg', engine: 'dot' }));
  } catch (error) {
    console.error(`render-diagrams: ${source} is not valid Graphviz:\n${String(error)}`);
    process.exit(1);
  }
  if (staged) execFileSync('git', ['add', output]);
  console.info(`render-diagrams: ${source} -> ${output}`);
}

function stagedSources() {
  const out = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'], {
    encoding: 'utf8',
  });
  return out.split('\0').filter((file) => file.endsWith('.dot'));
}
