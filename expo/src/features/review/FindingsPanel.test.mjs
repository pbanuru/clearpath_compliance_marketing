import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { FindingsPanel } from './FindingsPanel';

vi.mock('convex/react', () => ({ useMutation: () => vi.fn(), useQuery: () => undefined }));
vi.mock('@/features/auth/useAccount', () => ({
  useAccount: () => ({ user: { name: 'Reviewer' } }),
}));
vi.mock('expo-router', () => ({ usePathname: () => '/test', useGlobalSearchParams: () => ({}) }));

const originalSummary = 'No new issues identified.';
const originalApproval = {
  _id: 'approval',
  version: 2,
  outcome: 'approved',
  note: 'Original material approved.',
  acceptedFindingIds: [],
  decidedAt: 1,
};
function finding(source, version = 2, status = 'open') {
  return {
    _id: `${source}-${version}`,
    version,
    source,
    status,
    severity: 'required',
    title: 'Payment example missing total amount repaid',
    explanation: 'Show the total amount repaid with the payment example.',
  };
}
function render({
  findings = [],
  number = 2,
  current = 2,
  summary = originalSummary,
  items = 2,
} = {}) {
  const version = {
    _id: `version-${number}`,
    number,
    assets: Array.from({ length: items }, (_, i) => ({ _id: `asset-${i}`, kind: 'text' })),
    analysis: { status: 'succeeded', summary },
    responses: [],
    quickCheck: null,
  };
  return renderToStaticMarkup(
    createElement(FindingsPanel, {
      data: {
        review: { _id: 'review', status: 'in_review', currentVersion: current },
        findings,
        events: [],
        extractions: [],
        decisions: [originalApproval],
      },
      version,
      findings: findings.filter((f) => f.version === number),
      policies: [],
      editable: false,
      onSelect: vi.fn(),
      onEdit: vi.fn(),
      onAdd: vi.fn(),
      onRevised: vi.fn(),
    }),
  );
}

it.each(['open', 'accepted', 'dismissed', 'resolved'])(
  'labels the unchanged material summary as historical for a %s recheck finding',
  (status) => {
    const html = render({ findings: [finding('ai'), finding('recheck', 2, status)] });
    expect(html).toContain('aria-label="Summary before rule update"');
    expect(html).toContain('<h3>Summary before rule update across all 2 items</h3>');
    expect(html).toContain(`<p>${originalSummary}</p>`);
    expect(html).toContain('Payment example missing total amount repaid');
    expect(html).toContain(originalApproval.note);
  },
);

it.each([{ findings: [] }, { findings: [finding('ai')] }, { findings: [finding('reviewer')] }])(
  'keeps the normal summary label without recheck findings (%j)',
  ({ findings }) => {
    const html = render({ findings });
    expect(html).toContain('aria-label="Summary"');
    expect(html).toContain('<h3>Summary across all 2 items</h3>');
    expect(html).not.toContain('Summary before rule update');
  },
);

it('keeps a historical version summary labeled after the material is revised', () => {
  const html = render({ findings: [finding('recheck')], number: 2, current: 3 });
  expect(html).toContain('aria-label="Summary before rule update"');
  expect(html).toContain(`<p>${originalSummary}</p>`);
});

it('does not label a new material version from another version’s recheck findings', () => {
  const html = render({ findings: [finding('recheck')], number: 3, current: 3 });
  expect(html).toContain('aria-label="Summary"');
  expect(html).not.toContain('Summary before rule update');
});

it('labels a single-item historical summary without adding a material count', () => {
  const html = render({ findings: [finding('recheck')], items: 1 });
  expect(html).toContain('<h3>Summary before rule update</h3>');
  expect(html).not.toContain('across all');
});

it('does not invent a summary when the original analysis has none', () => {
  const html = render({ findings: [finding('recheck')], summary: '' });
  expect(html).not.toContain('cp-ai-summary');
});
