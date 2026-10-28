import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { queued } from '../pipelineTest.helpers';
import { PRICING_VERSION, price } from './pricing';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const span = {
  provider: 'openai' as const,
  operation: 'review' as const,
  model: 'gpt-6.1-sol',
  attempt: 1,
  status: 'succeeded' as const,
  startedAt: 1793188800000,
  durationMs: 10,
  usage: { inputTokens: 100, outputTokens: 100 },
  costUsd: 0.0012,
  costBasis: 'rate_estimate' as const,
  pricingVersion: PRICING_VERSION,
};

test('invalid completion rolls back findings, spans, and daily usage in one transaction', async () => {
  const { t, alice, reviewId, findingId } = await fixture();
  await t.run(async (ctx) => {
    await ctx.db.patch('reviews', reviewId, { status: 'checking' });
    const version = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_number', (q) => q.eq('reviewId', reviewId).eq('number', 1))
      .unique();
    if (!version) throw new Error('Missing version');
    await ctx.db.patch('reviewVersions', version._id, { analysis: { status: 'queued' } });
  });
  const started = await t.mutation(internal.review.state.start, { reviewId, version: 1 });
  if (!started) throw new Error('Expected running analysis');
  await expect(
    t.mutation(internal.review.state.finish, {
      reviewId,
      version: 1,
      runKey: started.runKey,
      spans: [span],
      extractions: [],
      result: {
        summary: 'Review',
        findings: [],
        previous: [{ findingId, status: 'resolved', note: 'Invalid current-version reference' }],
      },
    }),
  ).rejects.toThrow('Invalid previous finding');
  expect(await t.run((ctx) => ctx.db.query('aiSpans').collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query('aiUsageDaily').collect())).toEqual([]);
  expect((await alice.query(api.reviews.get, { reviewId })).findings[0]?.status).toBe('accepted');
});

test('completion replay cannot double charge a run', async () => {
  const { t, alice, reviewId } = await queued();
  const started = await t.mutation(internal.review.state.start, { reviewId, version: 1 });
  if (!started) throw new Error('Expected running analysis');
  const args = {
    reviewId,
    version: 1,
    runKey: started.runKey,
    spans: [span],
    extractions: [],
    result: { summary: 'No issues.', findings: [], previous: [] },
  };
  await t.mutation(internal.review.state.finish, args);
  await t.mutation(internal.review.state.finish, args);
  expect((await alice.query(api.reviews.get, { reviewId })).cost.spans).toBe(1);
  expect(await t.run((ctx) => ctx.db.query('aiUsageDaily').first())).toMatchObject({ calls: 1 });
});

test('pricing counts cached input once and reasoning inside output, with the long-context boundary', () => {
  expect(
    price('gpt-6.1-sol', {
      inputTokens: 272000,
      cachedInputTokens: 1000,
      outputTokens: 100,
      reasoningTokens: 50,
    }),
  ).toBeCloseTo(0.5431);
  expect(
    price('gpt-6.1-sol', {
      inputTokens: 272001,
      cachedInputTokens: 1000,
      outputTokens: 100,
      reasoningTokens: 50,
    }),
  ).toBeCloseTo(1.085704);
  expect(
    price('gpt-6.1-sol', { inputTokens: 1, cachedInputTokens: 2, outputTokens: 1 }),
  ).toBeNull();
  expect(price('unlisted', { audioSeconds: 30 })).toBeNull();
});
