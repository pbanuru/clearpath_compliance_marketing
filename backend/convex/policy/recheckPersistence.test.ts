import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { must } from './test.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('recheck completion refuses another owner or another owner asset in saved transcripts', async () => {
  const { t, alice, bob, reviewId, findingId, assetId } = await fixture();
  await alice.mutation(api.findings.setStatus, { findingId, status: 'dismissed' });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
  await alice.mutation(api.policies.edit, {
    key: 'advertised-rate-available',
    expectedVersion: 1,
    check: 'Include a payment.',
    changeSummary: 'Add payment.',
  });
  const bobAsset = await bob.mutation(api.assets.createText, {
    name: 'Private',
    text: 'Private material.',
  });
  const job = must(await t.run((ctx) => ctx.db.query('policyRechecks').first()));
  const loaded = must(await t.mutation(internal.policy.recheckState.start, { id: job._id }));
  for (const [owner, target] of [
    ['https://auth.example|bob', assetId],
    ['https://auth.example|alice', bobAsset],
  ] as const)
    await expect(
      t.mutation(internal.policy.recheckState.finish, {
        id: job._id,
        runKey: loaded.runKey,
        result: { summary: 'Passed.', findings: [], previous: [] },
        spans: [],
        extractions: [
          {
            owner,
            assetId: target,
            kind: 'transcript',
            status: 'succeeded',
            segments: [],
            model: 'universal-3-5-pro',
            createdAt: Date.now(),
          },
        ],
      }),
    ).rejects.toThrow('Extraction owner mismatch');
  expect(await t.run((ctx) => ctx.db.query('assetExtractions').collect())).toHaveLength(0);
});
