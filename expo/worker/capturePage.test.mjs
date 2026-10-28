import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@clearpath/backend/convex/webpageBlocks')
      return next(new URL('../../backend/convex/webpageBlocks.ts', import.meta.url).href, context);
    return next(specifier, context);
  },
});
const { renderCapture } = await import('./capturePage.ts');

// A page boundary fixture: evaluate runs the real browser callbacks. Lazy nodes
// enter the DOM only after their viewport's pending load has settled.
function pageFixture(items, initialHeight = 14000, grow = false) {
  let y = 0,
    height = initialHeight;
  const loaded = new Set();
  const scrolls = [];
  let photographed = [];
  class Element {
    parentElement = null;
    tagName = 'P';
    constructor(item) {
      this.item = item;
      this.childNodes = [{ nodeType: 3, textContent: item.text, owner: this }];
      if (item.parent) this.parentElement = new Element(item.parent);
    }
    clientLeft = 0;
    clientTop = 0;
    get clientWidth() {
      return this.item.width ?? 500;
    }
    get clientHeight() {
      return this.item.height ?? 40;
    }
    matches() {
      return true;
    }
    checkVisibility() {
      return true;
    }
    getBoundingClientRect() {
      const { x = 0, width = 500, top, height = 40 } = this.item;
      return {
        x,
        y: top - y,
        left: x,
        top: top - y,
        width,
        height,
        right: x + width,
        bottom: top - y + height,
      };
    }
  }
  const sandbox = {
    document: {
      title: 'Capture evidence fixture',
      documentElement: {
        style: {},
        get scrollHeight() {
          return height;
        },
      },
      querySelectorAll: () =>
        items
          .filter((item) => !item.lazy || loaded.has(item.text))
          .map((item) => new Element(item)),
      createRange: () => {
        let node;
        return {
          selectNodeContents: (value) => {
            node = value;
          },
          getClientRects: () => {
            const rect = node.owner.getBoundingClientRect();
            const height = node.owner.item.textHeight ?? rect.height;
            return [{ ...rect, height, bottom: rect.top + height }];
          },
        };
      },
    },
    HTMLElement: Element,
    Node: { TEXT_NODE: 3 },
    getComputedStyle: (element) => ({
      getPropertyValue: () => '',
      clipPath: 'none',
      display: 'block',
      webkitLineClamp: 'none',
      overflowX: 'visible',
      overflowY: 'visible',
      ...element.item.styles,
    }),
    location: { href: 'https://fixture.test/' },
    get scrollY() {
      return y;
    },
    scrollX: 0,
    window: {
      scrollTo: (options, nextY) => {
        if (typeof options === 'object') nextY = options.top;
        y = Math.min(nextY, height - 900);
        scrolls.push(y);
      },
    },
    requestAnimationFrame: (callback) => queueMicrotask(callback),
  };
  const page = {
    setViewport: async (viewport) =>
      assert.deepEqual(viewport, { width: 1440, height: 900, deviceScaleFactor: 1 }),
    goto: async () => ({ status: () => 200, headers: () => ({ 'content-type': 'text/html' }) }),
    title: async () => sandbox.document.title,
    evaluate: (callback, ...args) =>
      runInNewContext(`(${callback.toString()})(...args)`, { ...sandbox, args }),
    waitForNetworkIdle: async ({ timeout }) => {
      assert.ok(timeout > 0 && timeout <= 30000);
      for (const item of items)
        if (item.top < y + 900 && item.top + (item.height ?? 40) > y) loaded.add(item.text);
      if (grow && y >= 720) height = 14000;
    },
    screenshot: async () => {
      photographed = [...loaded];
      return new Uint8Array([255, 216, 255]);
    },
  };
  return { page, scrolls, photographed: () => photographed };
}

test('capture loads intermediate lazy content through the cap, including a growing document', async () => {
  const fixture = pageFixture(
    [
      { text: 'Middle offer', top: 3800, lazy: true },
      { text: 'Later disclosure', top: 7900, lazy: true },
      { text: 'Last captured offer', top: 11800, lazy: true },
      { text: 'Outside evidence', top: 12500, lazy: true },
    ],
    2200,
    true,
  );
  const result = await renderCapture(fixture.page, 'https://fixture.test/');
  assert.deepEqual(
    Array.from(result.blocks, (block) => block.text),
    ['Middle offer', 'Later disclosure', 'Last captured offer'],
  );
  assert.deepEqual(fixture.photographed(), [
    'Middle offer',
    'Later disclosure',
    'Last captured offer',
  ]);
  assert.ok(Math.max(...fixture.scrolls) <= 11100, 'never scroll past the captured range');
  assert.equal(fixture.scrolls.at(-1), 0);
  assert.equal(result.heightTruncated, true);
});

test('only wholly captured text becomes quote evidence; boundary-spanning blocks are omitted', async () => {
  const fixture = pageFixture([
    { text: 'Fully captured disclosure', top: 11960, height: 40 },
    { text: 'Visible beginning and absent disclosure', top: 11980, height: 80 },
    { text: 'Below the cap', top: 12000 },
    { text: 'Text overflows its captured box', top: 11950, height: 40, textHeight: 100 },
    { text: 'Horizontally clipped offer', top: 100, x: 1430, width: 30 },
    { text: 'Clipped at the top', top: -10 },
    { text: 'Zero size', top: 100, width: 0 },
  ]);
  const result = await renderCapture(fixture.page, 'https://fixture.test/');
  assert.deepEqual(
    Array.from(result.blocks, (block) => block.text),
    ['Fully captured disclosure'],
  );
  assert.equal(result.blocks[0].y + result.blocks[0].height, result.size.height);
});

test('the viewport walk shares the navigation loading deadline', async (t) => {
  let calls = 0;
  t.mock.method(Date, 'now', () => (calls++ === 0 ? 0 : 30001));
  const fixture = pageFixture([{ text: 'Pending lazy offer', top: 3800, lazy: true }]);
  await assert.rejects(renderCapture(fixture.page, 'https://fixture.test/'), /timed out/);
  assert.deepEqual(fixture.photographed(), []);
});

test('CSS-clipped and line-clamped text cannot become verified evidence', async () => {
  const fixture = pageFixture([
    { text: 'Unclipped disclosure', top: 100 },
    {
      text: 'Hidden disclosure lines',
      top: 200,
      height: 40,
      textHeight: 120,
      styles: { overflowY: 'hidden' },
    },
    { text: 'Clamped disclosure lines', top: 400, styles: { webkitLineClamp: '2' } },
    {
      text: 'Ancestor clips disclosure',
      top: 600,
      parent: { top: 600, height: 20, styles: { overflowY: 'hidden' } },
    },
    {
      text: 'Readable inside clipped container',
      top: 800,
      parent: { top: 780, height: 100, styles: { overflowY: 'hidden' } },
    },
  ]);
  const result = await renderCapture(fixture.page, 'https://fixture.test/');
  assert.deepEqual(
    Array.from(result.blocks, (block) => block.text),
    ['Unclipped disclosure', 'Readable inside clipped container'],
  );
});
