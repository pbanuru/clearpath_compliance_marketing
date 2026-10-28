// @vitest-environment happy-dom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WebpageMaterial } from './WebpageMaterial';
import { revealMaterialHighlight } from './materialScroll';

vi.mock('./materialScroll', () => ({ revealMaterialHighlight: vi.fn() }));
const findings = ['Headline', 'Disclosure'].map((title, index) => ({
  _id: title,
  title,
  severity: 'required',
  location: { region: { x: 0.1, y: index * 0.8, width: 0.8, height: 0.04 } },
}));
const asset = {
  name: 'Offer',
  content: { sourceUrl: 'https://example.test', size: { width: 1440, height: 12000 } },
};
const resized = new Set();
let root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        resized.add(this.callback);
      }
      disconnect() {
        resized.delete(this.callback);
      }
    },
  );
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function Harness() {
  const [selected, select] = useState(findings[0]);
  return createElement(
    'div',
    null,
    createElement(WebpageMaterial, {
      asset,
      url: '/capture.jpg',
      selected,
      findings,
      onSelect: select,
      onLoad: () => undefined,
      onError: () => undefined,
    }),
    ...findings.map((finding) =>
      createElement('button', { key: finding._id, onClick: () => select(finding) }, finding.title),
    ),
  );
}
it('keeps a box-to-card selection from being pulled back by image loading or resizing', () => {
  act(() => root.render(createElement(Harness)));
  vi.mocked(revealMaterialHighlight).mockClear();
  act(() => document.querySelector('[title="Disclosure"]').click());
  expect(document.querySelector('[aria-pressed="true"]').title).toBe('Disclosure');
  act(() => {
    document.querySelector('img').dispatchEvent(new Event('load'));
    for (const callback of resized) callback();
  });
  expect(revealMaterialHighlight).not.toHaveBeenCalled();
});
it('reveals card selections, including a finding previously selected from the image', () => {
  act(() => root.render(createElement(Harness)));
  act(() => document.querySelector('[title="Disclosure"]').click());
  const cards = [...document.querySelectorAll('button:not(.cp-image-region)')];
  act(() => cards[0].click());
  expect(revealMaterialHighlight).toHaveBeenLastCalledWith(
    document.querySelector('[title="Headline"]'),
  );
  vi.mocked(revealMaterialHighlight).mockClear();
  act(() => cards[1].click());
  expect(revealMaterialHighlight).toHaveBeenCalledWith(
    document.querySelector('[title="Disclosure"]'),
  );
});
