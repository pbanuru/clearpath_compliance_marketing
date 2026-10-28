import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const paginationOpts = { numItems: 25, cursor: null };

test('campaign and main queue share previews, failure state, pins, and current campaign names', async () => {
  const { alice, bob, reviewId, t } = await fixture();
  const campaignId = await alice.mutation(api.campaigns.create, { name: 'Spring launch' });
  await alice.mutation(api.reviews.setCampaign, { reviewId, campaignId });
  await alice.mutation(api.reviews.pin, { reviewId });
  await t.run(async (ctx) => {
    const version = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_number', (q) => q.eq('reviewId', reviewId).eq('number', 1))
      .unique();
    if (!version) throw new Error('Missing version');
    await ctx.db.patch('reviewVersions', version._id, {
      analysis: { status: 'failed', error: 'Test failure' },
    });
  });
  const main = (await alice.query(api.reviews.queue, { paginationOpts })).page[0];
  const grouped = (await alice.query(api.campaigns.get, { campaignId, paginationOpts })).submissions
    .page[0];
  expect(grouped).toEqual(main);
  expect(grouped).toMatchObject({
    campaignName: 'Spring launch',
    analysisFailed: true,
    cover: { kind: 'text', name: 'Ad', text: 'Guaranteed approval in minutes.' },
  });
  expect(grouped?.pinnedRank).toBeTypeOf('number');
  expect((await bob.query(api.reviews.queue, { paginationOpts })).page).toEqual([]);
  await expect(bob.query(api.campaigns.get, { campaignId, paginationOpts })).rejects.toThrow(
    'not found',
  );
  await alice.mutation(api.campaigns.update, { campaignId, name: 'Renamed launch' });
  expect((await alice.query(api.reviews.queue, { paginationOpts })).page[0]?.campaignName).toBe(
    'Renamed launch',
  );
  await alice.mutation(api.reviews.setCampaign, { reviewId });
  const removed = (await alice.query(api.reviews.queue, { paginationOpts })).page[0];
  expect(removed?.campaignName).toBeUndefined();
  expect(removed?.pinnedRank).toBe(grouped?.pinnedRank);
  // Keep the earlier list contract's compact cover shape for existing clients.
  expect(
    (await alice.query(api.reviews.list, { filter: 'all', paginationOpts })).page[0]?.cover,
  ).toEqual({ kind: 'text', name: 'Ad' });
});
