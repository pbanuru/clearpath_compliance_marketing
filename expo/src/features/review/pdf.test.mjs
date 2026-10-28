import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfQuoteRanges } from './pdfQuote.ts';

test('the mortgage PDF exposes its page count and quote locations', async () => {
  const task = getDocument({
    data: new Uint8Array(
      readFileSync(new URL('../../../public/examples/mortgage-landing-page.pdf', import.meta.url)),
    ),
  });
  try {
    const pdf = await task.promise;
    assert.equal(pdf.numPages, 1);
    const content = await (await pdf.getPage(1)).getTextContent();
    const runs = content.items.filter((item) => 'str' in item).map((item) => item.str);
    const quote = 'Get pre-approved for your dream home in 5 minutes';
    const ranges = pdfQuoteRanges(runs, quote);
    assert.ok(ranges.length > 5);
    assert.equal(
      ranges
        .map((r) => runs[r.run].slice(r.start, r.end))
        .join(' ')
        .replace(/\s+/g, ' '),
      quote,
    );
    assert.deepEqual(pdfQuoteRanges(runs, 'This quote does not appear in the mortgage PDF.'), []);
  } finally {
    await task.destroy();
  }
});

test('quote offsets survive line breaks, smart quotes, ligatures and UTF-16', () => {
  assert.deepEqual(pdfQuoteRanges(['A “ﬁne”', 'offer'], 'a "fine" offer'), [
    { run: 0, start: 0, end: 1 },
    { run: 0, start: 2, end: 7 },
    { run: 1, start: 0, end: 5 },
  ]);
  assert.deepEqual(pdfQuoteRanges(['🏠 home'], 'home'), [{ run: 0, start: 3, end: 7 }]);
  assert.deepEqual(pdfQuoteRanges(['hello'], '   '), []);
  assert.deepEqual(pdfQuoteRanges(['pre-', 'approved'], 'pre-approved'), [
    { run: 0, start: 0, end: 4 },
    { run: 1, start: 0, end: 8 },
  ]);
});
