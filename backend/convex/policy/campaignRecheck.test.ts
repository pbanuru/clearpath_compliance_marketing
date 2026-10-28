import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { output, response } from '../pipelineTest.helpers';
import { fetcher, must } from './test.helpers';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('policy reopening preserves campaign membership, updates readiness counts, and retains approval history', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('OPENAI_API_KEY', 'stub');
  const { t, alice, reviewId, findingId, assetId } = await fixture();
  const campaignId = await alice.mutation(api.campaigns.create, { name: 'Retention campaign' });
  await alice.mutation(api.reviews.setCampaign, { reviewId, campaignId });
  await alice.mutation(api.findings.setStatus, { findingId, status: 'dismissed' });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
  const paginationOpts = { numItems: 10, cursor: null };
  const campaign = () => alice.query(api.campaigns.get, { campaignId, paginationOpts });
  expect((await campaign()).counts).toMatchObject({ total: 1, approved: 1, needs_review: 0 });
  await alice.mutation(api.policies.edit, {
    key: 'advertised-rate-available',
    expectedVersion: 1,
    check: 'Every advertised rate must include a representative payment example.',
    changeSummary: 'Require a payment example.',
  });
  const result = output(assetId);
  must(result.findings[0]).policyId = 'advertised-rate-available';
  fetcher(() => response(JSON.stringify(result)));
  const job = must(await t.run((ctx) => ctx.db.query('policyRechecks').first()));
  await t.action(internal.policy.recheck.run, { id: job._id });
  expect((await campaign()).counts).toMatchObject({ total: 1, approved: 0, needs_review: 1 });
  expect((await campaign()).submissions.page[0]).toMatchObject({
    campaignId,
    campaignName: 'Retention campaign',
    recheckOpen: true,
  });
  for (const filter of ['approved', 'rechecks'] as const) {
    const rows = await alice.query(api.reviews.list, { filter, paginationOpts });
    expect(rows.page).toContainEqual(
      expect.objectContaining({
        _id: reviewId,
        campaignId,
        campaignName: 'Retention campaign',
      }),
    );
  }
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
  expect((await campaign()).counts).toMatchObject({ total: 1, approved: 1, needs_review: 0 });
  const detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.decisions).toHaveLength(2);
  expect(detail.review.campaignId).toBe(campaignId);
});
