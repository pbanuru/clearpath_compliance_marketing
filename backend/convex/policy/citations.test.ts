import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { workspace, must } from './test.helpers';
import { retrieveCitation } from './citationText';
import { seedCitations } from './citationSeeds';
afterEach(() => vi.unstubAllGlobals());
test('seed versions carry verbatim citations, standards have none, and histories remain owner scoped', async () => {
  const { alice, bob } = await workspace();
  const rules = await alice.query(api.policies.list, {});
  expect(rules.filter((p) => p.citation)).toHaveLength(13);
  expect(rules.filter((p) => p.kind === 'clearpath_standard').every((p) => !p.citation)).toBe(true);
  const history = await alice.query(api.policies.history, { key: 'closed-end-trigger-terms' });
  expect(history[0]?.citation).toEqual(seedCitations['closed-end-trigger-terms']);
  expect(
    await bob.query(api.policies.version, { key: 'closed-end-trigger-terms', version: 1 }),
  ).toBeNull();
});
test('citation retrieval uses the precise eCFR passage and records failure without replacing history', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          url.includes('/versions/')
            ? JSON.stringify({ meta: { latest_issue_date: '2026-10-27' } })
            : '<DIV8><P>(3) Unrelated earlier paragraph.</P><P>(3) Stating the term “introductory”. The term must be next to the rate.</P></DIV8>',
        ),
      ),
    ),
  );
  const citation = await retrieveCitation(
    'https://www.ecfr.gov/current/title-12/part-1026/section-1026.16#p-1026.16(g)(3)',
    'introductory rate',
    '(3) Stating the term',
  );
  expect(citation.excerpt).toBe(
    '(3) Stating the term “introductory”. The term must be next to the rate.',
  );
  const { t, alice } = await workspace();
  const old = must((await alice.query(api.policies.history, { key: 'fair-lending' }))[0]);
  const id = await t.run((ctx) =>
    ctx.db.insert('policyVersions', {
      owner: old.owner,
      key: old.key,
      version: 2,
      title: old.title,
      appliesTo: old.appliesTo,
      check: 'New rule text.',
      changeSummary: 'Changed.',
      createdBy: 'source_update',
      createdAt: Date.now(),
    }),
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('gone', { status: 404, statusText: 'Not Found' }))),
  );
  await t.action(internal.policy.citations.retrieve, { id, url: 'https://example.gov/rule' });
  const failed = await t.run((ctx) => ctx.db.get('policyVersions', id));
  expect(failed?.citation).toBeUndefined();
  expect(failed?.citationError).toContain('404 Not Found');
  expect((await alice.query(api.policies.version, { key: old.key, version: 1 }))?.citation).toEqual(
    old.citation,
  );
});
test('page citations quote fetched text and use a matching text fragment', async () => {
  const quote =
    'Lenders must clearly disclose the total payment and the repayment term alongside any advertised rate.';
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(`<main><p>${quote}</p></main>`))),
  );
  const citation = await retrieveCitation(
    'https://example.gov/guidance',
    'disclose payment repayment advertised',
  );
  expect(citation.excerpt).toBe(quote);
  expect(decodeURIComponent(must(citation.url.split('#:~:text=')[1]))).toBe(
    'Lenders must clearly disclose the total payment and the repayment term alongside any advertised',
  );
  expect(citation.retrievedAt).toBeGreaterThan(0);
});

test('seed link corrections preserve the verified quote and its retrieval timestamp', async () => {
  const { t, alice } = await workspace();
  const original = must((await alice.query(api.policies.history, { key: 'clear-conspicuous' }))[0]);
  const citation = must(original.citation);
  await t.run((ctx) =>
    ctx.db.patch('policyVersions', original._id, {
      citation: { ...citation, url: 'https://example.gov/old-fragment' },
    }),
  );
  await alice.mutation(api.policies.initialize, {});
  expect(
    (await alice.query(api.policies.version, { key: original.key, version: 1 }))?.citation,
  ).toEqual(citation);
});
