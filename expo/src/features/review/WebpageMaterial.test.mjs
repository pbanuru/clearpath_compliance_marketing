import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WebpageMaterial } from './WebpageMaterial';

const asset = {
  _id: 'page',
  _creationTime: 0,
  kind: 'webpage',
  name: 'Offer',
  content: {
    sourceUrl: 'https://example.test/offer',
    finalUrl: 'https://example.test/final',
    capturedAt: 0,
    size: { width: 1440, height: 12000 },
    heightTruncated: true,
  },
};
const findings = [
  {
    _id: 'first',
    title: 'Qualify the headline',
    severity: 'required',
    location: { assetId: 'page', region: { x: 0.1, y: 0.2, width: 0.5, height: 0.04 } },
  },
  {
    _id: 'second',
    title: 'Move the disclosure',
    severity: 'recommended',
    location: { assetId: 'page', region: { x: 0.1, y: 0.9, width: 0.5, height: 0.01 } },
  },
  { _id: 'unlocated', title: 'Ask for context', severity: 'needs_context' },
];
const render = (selected = findings[1]) =>
  renderToStaticMarkup(
    createElement(WebpageMaterial, {
      asset,
      url: 'https://storage.test/capture.jpg',
      findings,
      selected,
      onSelect: vi.fn(),
      onError: vi.fn(),
      onLoad: vi.fn(),
    }),
  );

describe('webpage resource and finding contract', () => {
  it('renders every located finding as a selectable, severity-colored exact region', () => {
    const html = render();
    expect(html.match(/class="cp-image-region/g)).toHaveLength(2);
    expect(html).toContain('class="cp-image-region required "');
    expect(html).toContain('class="cp-image-region recommended selected"');
    expect(html).toContain(
      'aria-label="Select finding: Qualify the headline" aria-pressed="false"',
    );
    expect(html).toContain('aria-label="Select finding: Move the disclosure" aria-pressed="true"');
    expect(html).toContain('left:10%;top:90%;width:50%;height:1%');
    expect(html).not.toContain('Select finding: Ask for context');
  });

  it('keeps the captured image, source, timestamp, live link and height-limit notice', () => {
    const html = render();
    expect(html).toContain('src="https://storage.test/capture.jpg"');
    expect(html).toContain('https://example.test/offer');
    expect(html).toContain('Captured ');
    expect(html).toContain('href="https://example.test/final"');
    expect(html).toContain('Open live page');
    expect(html).toContain('Capture ends at 12,000 pixels.');
    expect(html).toContain('role="region" aria-label="Captured web page"');
  });
});
