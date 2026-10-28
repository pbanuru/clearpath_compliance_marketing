import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { must } from './test.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('current failures remain blocking and retryable after 500 historical rechecks', async () => {
  const { t, alice, bob, reviewId, findingId } = await fixture();
  await alice.mutation(api.findings.setStatus, { findingId, status: 'dismissed' });
  const jobs = await t.run(async (ctx) => {
    const base = {
      owner: 'https://auth.example|alice',
      reviewId,
      version: 1,
      key: 'advertised-rate-available',
      fromVersion: 0,
      toVersion: 1,
      title: 'Advertised rate',
      changeSummary: 'Updated standard.',
      oldCheck: 'Old check.',
      newCheck: 'New check.',
      createdAt: Date.now(),
    };
    for (let i = 0; i < 500; i++)
      await ctx.db.insert('policyRechecks', { ...base, status: 'passed' });
    const ids = [];
    for (const key of ['advertised-rate-available', 'soft-pull-claims', 'mortgage-identifiers'])
      ids.push(
        await ctx.db.insert('policyRechecks', {
          ...base,
          key,
          status: 'running',
          runKey: key,
        }),
      );
    await ctx.db.patch('reviews', reviewId, { pendingRechecks: 3 });
    return ids;
  });
  const clean = { summary: 'No issues.', findings: [], previous: [] };
  for (const [index, key] of ['advertised-rate-available', 'soft-pull-claims'].entries())
    await t.mutation(internal.policy.recheckState.finish, {
      id: must(jobs[index]),
      runKey: key,
      result: null,
      error: 'Provider unavailable.',
      spans: [],
    });
  await t.mutation(internal.policy.recheckState.finish, {
    id: must(jobs[2]),
    runKey: 'mortgage-identifiers',
    result: clean,
    spans: [],
  });
  expect((await alice.query(api.reviews.get, { reviewId })).review).toMatchObject({
    recheckFailed: true,
    pendingRechecks: 0,
  });
  await expect(
    alice.mutation(api.reviews.decide, {
      reviewId,
      version: 1,
      outcome: 'approved',
    }),
  ).rejects.toThrow('Retry the failed policy recheck');
  await expect(bob.mutation(api.policy.recheckState.retry, { reviewId })).rejects.toThrow(
    'Recheck not found',
  );
  expect(await alice.mutation(api.policy.recheckState.retry, { reviewId })).toBe(2);
  expect((await alice.query(api.reviews.get, { reviewId })).review.pendingRechecks).toBe(2);
  for (const id of jobs.slice(0, 2)) {
    const loaded = must(await t.mutation(internal.policy.recheckState.start, { id }));
    await t.mutation(internal.policy.recheckState.finish, {
      id,
      runKey: loaded.runKey,
      result: clean,
      spans: [],
    });
  }
  expect((await alice.query(api.reviews.get, { reviewId })).review).toMatchObject({
    recheckFailed: false,
    pendingRechecks: 0,
  });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
  expect((await alice.query(api.reviews.get, { reviewId })).review.status).toBe('approved');
  expect(
    await t.run(async (ctx) =>
      (await ctx.db.query('policyRechecks').collect()).filter((job) => job.status === 'passed'),
    ),
  ).toHaveLength(503);
});
