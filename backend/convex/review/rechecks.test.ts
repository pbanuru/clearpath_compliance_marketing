import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { output, response } from '../pipelineTest.helpers';
import { record } from './parsing';

// Detailed-review contracts; quick-check suites exercise the combined preview path.
vi.mock('./quickCheckRun', () => ({ runQuickCheck: () => Promise.resolve({ rules: [] }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('OPENAI_API_KEY', 'stub-key');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test.each([true, false])(
  'recheck retains one specific finding with changed wording (explicit link: %s)',
  async (explicit) => {
    const { t, alice, reviewId, findingId, input, assetId } = await fixture();
    await alice.mutation(api.reviews.decide, {
      reviewId,
      version: 1,
      outcome: 'changes_requested',
    });
    await alice.mutation(api.reviews.resubmit, {
      reviewId,
      assetIds: input.assetIds,
      responses: [{ findingId, text: 'Revised the claim.' }],
    });
    const result = output(assetId);
    const specific = {
      ...result.findings[0],
      policyId: 'approval-claims',
      title: 'Qualify the revised approval claim',
      location: { ...result.findings[0]?.location, assetId, quote: 'approval in minutes' },
      previousFindingId: explicit ? findingId : null,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          response(
            JSON.stringify({
              ...result,
              findings: [specific],
              previous: [
                {
                  findingId,
                  status: 'still_present',
                  note: 'The remaining claim still guarantees approval.',
                },
              ],
            }),
          ),
        ),
      ),
    );
    await t.action(internal.review.analysis.run, { reviewId, version: 2 });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.versions[1]?.analysis.status).toBe('succeeded');
    const current = detail.findings.filter((f) => f.version === 2);
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({
      title: specific.title,
      previousFindingId: findingId,
      location: { assetId, quote: 'approval in minutes' },
    });
    expect(detail.review.counts.required).toBe(1);
    expect(detail.findings.find((f) => f._id === findingId)?.recheckNote).toBeTruthy();
  },
);

test('extraction retry rechecks resolved findings from the previous decision snapshot', async () => {
  const { t, alice, reviewId, findingId, input } = await fixture();
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'changes_requested' });
  await alice.mutation(api.reviews.resubmit, {
    reviewId,
    assetIds: input.assetIds,
    responses: [{ findingId, text: 'Updated the material.' }],
  });
  let calls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: string, init?: RequestInit) => {
      calls++;
      if (typeof init?.body !== 'string') throw new Error('Expected model input');
      const body = record(JSON.parse(init.body));
      expect(JSON.stringify(body.input)).toContain(findingId);
      return Promise.resolve(
        response(
          JSON.stringify({
            summary: `Read ${calls}`,
            findings: [],
            previous: [
              {
                findingId,
                status: calls === 1 ? 'resolved' : 'still_present',
                note: `Evidence ${calls}`,
              },
            ],
          }),
        ),
      );
    }),
  );
  await t.action(internal.review.analysis.run, { reviewId, version: 2 });
  const first = await alice.query(api.reviews.get, { reviewId });
  expect(first.findings.find((f) => f._id === findingId)).toMatchObject({
    status: 'resolved',
    recheckNote: 'Evidence 1',
  });
  await t.run(async (ctx) => {
    const version = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_number', (q) => q.eq('reviewId', reviewId).eq('number', 2))
      .unique();
    if (!version) throw new Error('Missing current version');
    await ctx.db.patch('reviewVersions', version._id, {
      analysis: { ...version.analysis, extractionNotes: ['Visual extraction unavailable.'] },
    });
  });
  await alice.mutation(api.reviews.retryAnalysis, { reviewId });
  await t.action(internal.review.analysis.run, { reviewId, version: 2 });
  const second = await alice.query(api.reviews.get, { reviewId });
  expect(calls).toBe(2);
  expect(second.versions[1]?.analysis.status).toBe('succeeded');
  expect(second.findings.find((f) => f._id === findingId)).toMatchObject({
    status: 'accepted',
    recheckNote: 'Evidence 2',
  });
  expect(second.findings.filter((f) => f.version === 2)).toHaveLength(1);
  expect(second.findings.find((f) => f.version === 2)?.previousFindingId).toBe(findingId);
  expect(second.decisions.find((d) => d.version === 1)?.acceptedFindingIds).toEqual([findingId]);
});
