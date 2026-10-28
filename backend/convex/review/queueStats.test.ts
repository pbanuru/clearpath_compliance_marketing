import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MONDAY = Date.parse('2026-10-26T00:00:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(MONDAY + 12 * HOUR);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function withDecision(decidedAt: number) {
  const data = await fixture();
  const { t, alice, findingId, reviewId } = data;
  await alice.mutation(api.findings.setStatus, { findingId, status: 'open' });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
  await t.run(async (ctx) => {
    const decision = await ctx.db
      .query('decisions')
      .withIndex('by_reviewId_and_version', (q) => q.eq('reviewId', reviewId).eq('version', 1))
      .unique();
    if (!decision) throw new Error('Missing decision');
    await ctx.db.patch('decisions', decision._id, { decidedAt });
    await ctx.db.patch('reviews', reviewId, { createdAt: decidedAt - 3 * HOUR });
  });
  return data;
}

test('the reporting argument moves the UTC Monday window without a data write', async () => {
  const { alice } = await withDecision(MONDAY - 2 * HOUR);
  const sunday = { asOf: MONDAY - HOUR };
  const monday = { asOf: MONDAY };

  const before = await alice.query(api.reviews.stats, sunday);
  expect(before.decidedThisWeek).toBe(1);
  expect((await alice.query(api.reviews.stats, monday)).decidedThisWeek).toBe(0);

  // With an unchanged argument and dataset, passing server time cannot move the window.
  vi.setSystemTime(MONDAY + 8 * DAY);
  expect(await alice.query(api.reviews.stats, sunday)).toEqual(before);
});

test('the reporting argument advances the rolling 30-day first-decision window', async () => {
  const { alice } = await withDecision(MONDAY - 30 * DAY + HOUR / 2);
  expect((await alice.query(api.reviews.stats, { asOf: MONDAY })).medianFirstDecisionMs).toBe(
    3 * HOUR,
  );
  expect(
    (await alice.query(api.reviews.stats, { asOf: MONDAY + HOUR })).medianFirstDecisionMs,
  ).toBeNull();
});

test('future reporting times are clamped to one minute of server clock skew', async () => {
  vi.setSystemTime(MONDAY - 2 * 60_000);
  const { alice } = await withDecision(MONDAY - 2 * HOUR);
  const ceiling = await alice.query(api.reviews.stats, { asOf: Date.now() + 60_000 });
  expect(ceiling.decidedThisWeek).toBe(1);
  expect(await alice.query(api.reviews.stats, { asOf: MONDAY })).toEqual(ceiling);
  expect(await alice.query(api.reviews.stats, { asOf: MONDAY + 365 * DAY })).toEqual(ceiling);
  await expect(alice.query(api.reviews.stats, { asOf: NaN })).rejects.toThrow(
    'Invalid reporting time',
  );
});
