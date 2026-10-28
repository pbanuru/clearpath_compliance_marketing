import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FindingCard } from './FindingCard';

vi.mock('convex/react', () => ({ useMutation: () => vi.fn() }));

const finding = {
  _id: 'finding',
  title: 'Qualify the approval claim',
  explanation: 'The headline promises approval. Eligibility still depends on underwriting.',
  severity: 'required',
  status: 'open',
};
const policy = {
  id: 'approval',
  title: 'Approval claims',
  kind: 'guidance',
  appliesTo: {},
  check: 'Qualify approval claims.',
  source: { label: 'Source passage', url: 'https://example.com/rules#approval' },
};
function render(overrides) {
  return renderToStaticMarkup(
    createElement(FindingCard, {
      finding: { ...finding, ...overrides },
      policy,
      editable: true,
      selected: false,
      onSelect: vi.fn(),
      onEdit: vi.fn(),
    }),
  );
}

describe('finding evidence contract', () => {
  it('shows the exact material quote in quotation marks', () => {
    const html = render({ location: { assetId: 'asset', quote: 'Guaranteed approval.' } });
    expect(html).toContain('“Guaranteed approval.”');
    expect(html).not.toContain('The headline promises approval.');
  });

  it.each([
    [{ page: 2 }, 'Page 2'],
    [{ startSeconds: 14, endSeconds: 19 }, '0:14 to 0:19'],
    [{ region: { x: 0, y: 0.8, width: 0.2, height: 0.1 } }, 'Image, lower left'],
  ])(
    'shows the first explanation sentence with its location when there is no quote',
    (location, label) => {
      const html = render({ location: { assetId: 'asset', ...location } });
      expect(html).toContain('The headline promises approval.');
      expect(html).toContain(label);
      expect(html).not.toContain('“The headline promises approval.”');
      expect(html).not.toContain('Eligibility still depends on underwriting.');
    },
  );

  it('links the policy and source label to the source passage in a new tab', () => {
    const html = render({});
    expect(html).toContain(
      'href="https://example.com/rules#approval" target="_blank" rel="noreferrer"',
    );
    expect(html).toContain(policy.title);
    expect(html).toContain(policy.source.label);
  });
});
