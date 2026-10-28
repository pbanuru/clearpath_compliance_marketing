import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { must } from './test.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('accumulated rechecks count every finding, guard approval, and retain accepted findings through resubmission', async () => {
  const { t, alice, reviewId, findingId, assetId } = await fixture();
  await alice.mutation(api.findings.setStatus, { findingId, status: 'dismissed' });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
  await alice.mutation(api.policies.edit, {
    key: 'advertised-rate-available',
    expectedVersion: 1,
    check: 'Include a representative payment.',
    changeSummary: 'Require a payment example.',
  });
  await t.run(async (ctx) => {
    for (let i = 0; i < 200; i++)
      await ctx.db.insert('findings', {
        owner: 'https://auth.example|alice',
        reviewId,
        version: 1,
        source: 'recheck',
        policyId: 'advertised-rate-available',
        policyVersion: 1,
        severity: 'required',
        status: 'dismissed',
        title: `Earlier finding ${i}`,
        explanation: 'Historical recheck finding.',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
  });
  const job = must(await t.run((ctx) => ctx.db.query('policyRechecks').first()));
  const loaded = must(await t.mutation(internal.policy.recheckState.start, { id: job._id }));
  await t.mutation(internal.policy.recheckState.finish, {
    id: job._id,
    runKey: loaded.runKey,
    spans: [],
    result: {
      summary: 'Missing payment details.',
      previous: [],
      findings: [1, 2, 3].map((n) => ({
        policyId: 'advertised-rate-available',
        severity: 'required' as const,
        title: `New finding ${n}`,
        explanation: 'Add the payment detail.',
        suggestedFix: 'Add a representative payment.',
        confidence: 'high' as const,
      })),
    },
  });
  let detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.findings).toHaveLength(204);
  expect(detail.review.counts.required).toBe(3);
  const latest = must(detail.findings.find((f) => f.title === 'New finding 3'));
  await alice.mutation(api.findings.setStatus, { findingId: latest._id, status: 'accepted' });
  await expect(
    alice.mutation(api.reviews.decide, {
      reviewId,
      version: 1,
      outcome: 'approved',
    }),
  ).rejects.toThrow('Dismiss or resolve accepted findings');
  await alice.mutation(api.reviews.decide, {
    reviewId,
    version: 1,
    outcome: 'changes_requested',
  });
  detail = await alice.query(api.reviews.get, { reviewId });
  expect(
    detail.decisions.find((d) => d.outcome === 'changes_requested')?.acceptedFindingIds,
  ).toEqual([latest._id]);
  expect(detail.findings.filter((f) => f.status === 'open')).toHaveLength(0);
  expect(detail.review.counts.required).toBe(1);
  await alice.mutation(api.reviews.resubmit, {
    reviewId,
    assetIds: [assetId],
    responses: [{ findingId: latest._id, text: 'Added payment.' }],
  });
  const analysis = must(await t.mutation(internal.review.state.start, { reviewId, version: 2 }));
  expect(analysis.previous.map((f) => f._id)).toEqual([latest._id]);
  expect(analysis.version.responses[0]?.findingId).toBe(latest._id);
});
