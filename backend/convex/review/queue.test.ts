import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../_generated/api';
import { fixture, setup } from '../reviewTest.helpers';
import { queueCompare } from './queueOrder';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const paginationOpts = { numItems: 100, cursor: null };

test('queue previews are workspace scoped; pin and unpin check both owners', async () => {
  const { t, alice, bob, reviewId, input } = await fixture();
  const second = await alice.mutation(api.reviews.create, { ...input, title: 'Second' });
  const unauthenticated = setup();
  await expect(unauthenticated.query(api.reviews.queue, { paginationOpts })).rejects.toThrow(
    'Sign in',
  );
  const rows = await alice.query(api.reviews.queue, { paginationOpts });
  expect(rows.page.find((r) => r._id === reviewId)?.cover).toMatchObject({
    kind: 'text',
    text: 'Guaranteed approval in minutes.',
  });
  expect((await bob.query(api.reviews.queue, { paginationOpts })).page).toEqual([]);
  await expect(bob.mutation(api.reviews.pin, { reviewId })).rejects.toThrow('not found');
  await expect(bob.mutation(api.reviews.unpin, { reviewId })).rejects.toThrow('not found');
  await expect(alice.mutation(api.reviews.pin, { reviewId, beforeId: second })).rejects.toThrow(
    'Needs review',
  );
  await expect(bob.mutation(api.reviews.create, input)).rejects.toThrow('Asset not found');
  await alice.mutation(api.reviews.pin, { reviewId });
  expect((await alice.query(api.reviews.get, { reviewId })).review.pinnedRank).toBeTypeOf('number');
  await alice.mutation(api.reviews.unpin, { reviewId });
  expect((await alice.query(api.reviews.get, { reviewId })).review.pinnedRank).toBeUndefined();
  await t.run(async (ctx) => {
    const version = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_number', (q) => q.eq('reviewId', reviewId).eq('number', 1))
      .unique();
    if (!version) throw new Error('Missing version');
    await ctx.db.patch('reviewVersions', version._id, {
      analysis: { status: 'failed', error: 'Provider unavailable' },
    });
  });
  expect(
    (await alice.query(api.reviews.queue, { paginationOpts })).page.find((r) => r._id === reviewId)
      ?.analysisFailed,
  ).toBe(true);
});

test('default date and waiting order, precise drag placement and unpin restoration', async () => {
  const { t, alice, bob, reviewId, input, findingId } = await fixture();
  const soon = await alice.mutation(api.reviews.create, {
    ...input,
    title: 'Soon',
    goLiveDate: '2026-10-29',
  });
  const later = await alice.mutation(api.reviews.create, {
    ...input,
    title: 'Later',
    goLiveDate: '2026-11-02',
  });
  const foreignAsset = await bob.mutation(api.assets.createText, {
    name: 'Private',
    text: 'Private copy',
  });
  const foreign = await bob.mutation(api.reviews.create, { ...input, assetIds: [foreignAsset] });
  await t.run(async (ctx) => {
    await ctx.db.patch('reviews', soon, { status: 'in_review' });
    await ctx.db.patch('reviews', later, { status: 'in_review' });
    await ctx.db.patch('reviews', reviewId, { createdAt: Date.now() - 3 * 3600000 });
  });
  async function order() {
    return (await alice.query(api.reviews.queue, { paginationOpts })).page
      .sort(queueCompare)
      .map((r) => r._id);
  }
  expect(await order()).toEqual([soon, later, reviewId]);
  await expect(alice.mutation(api.reviews.pin, { reviewId, beforeId: foreign })).rejects.toThrow(
    'not found',
  );
  await alice.mutation(api.reviews.pin, { reviewId, beforeId: later });
  expect(await order()).toEqual([soon, reviewId, later]);
  await alice.mutation(api.reviews.pin, { reviewId });
  expect(await order()).toEqual([reviewId, soon, later]);
  await alice.mutation(api.reviews.unpin, { reviewId });
  expect(await order()).toEqual([soon, later, reviewId]);
  await alice.mutation(api.findings.setStatus, { findingId, status: 'open' });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
  await expect(alice.mutation(api.reviews.pin, { reviewId })).rejects.toThrow('Only items');
});

test('resetting the order clears only the signed-in workspace pins', async () => {
  const { alice, bob, reviewId, input, t } = await fixture();
  const second = await alice.mutation(api.reviews.create, { ...input, title: 'Second' });
  const assetId = await bob.mutation(api.assets.createText, { name: 'Private', text: 'Copy' });
  const foreign = await bob.mutation(api.reviews.create, { ...input, assetIds: [assetId] });
  await t.run(async (ctx) => {
    await ctx.db.patch('reviews', second, { status: 'in_review' });
    await ctx.db.patch('reviews', foreign, { status: 'in_review' });
  });
  await alice.mutation(api.reviews.pin, { reviewId });
  await alice.mutation(api.reviews.pin, { reviewId: second });
  await bob.mutation(api.reviews.pin, { reviewId: foreign });
  await expect(setup().mutation(api.reviews.resetOrder, {})).rejects.toThrow('Sign in');
  await alice.mutation(api.reviews.resetOrder, {});
  const rows = await alice.query(api.reviews.queue, { paginationOpts });
  expect(rows.page.every((r) => r.pinnedRank === undefined)).toBe(true);
  expect((await bob.query(api.reviews.get, { reviewId: foreign })).review.pinnedRank).toBeTypeOf(
    'number',
  );
});

test('dragging from longest waiting preserves the visible order and its base across later moves', async () => {
  const { t, alice, reviewId, input } = await fixture();
  const soon = await alice.mutation(api.reviews.create, {
    ...input,
    goLiveDate: '2026-10-29',
  });
  const later = await alice.mutation(api.reviews.create, {
    ...input,
    goLiveDate: '2026-11-02',
  });
  await t.run(async (ctx) => {
    await ctx.db.patch('reviews', reviewId, { waitingSince: 10000000 });
    await ctx.db.patch('reviews', soon, { status: 'in_review', waitingSince: 20000000 });
    await ctx.db.patch('reviews', later, { status: 'in_review', waitingSince: 30000000 });
  });
  await alice.mutation(api.reviews.pin, { reviewId });
  await alice.mutation(api.reviews.pin, {
    reviewId: later,
    beforeId: soon,
    sort: 'waiting',
  });
  async function order() {
    const { page } = await alice.query(api.reviews.queue, { paginationOpts });
    return page.sort((a, b) => queueCompare(a, b, 'waiting')).map((r) => r._id);
  }
  expect(await order()).toEqual([reviewId, later, soon]);
  expect((await alice.query(api.reviews.get, { reviewId })).review.pinnedRank).toBeUndefined();
  expect((await alice.query(api.reviews.get, { reviewId: later })).review.pinnedSort).toBe(
    'waiting',
  );
  await alice.mutation(api.reviews.pin, { reviewId: soon, beforeId: reviewId });
  expect(await order()).toEqual([soon, reviewId, later]);
});
