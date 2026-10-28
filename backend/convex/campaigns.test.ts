import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from './_generated/api';
import { fixture, setup } from './reviewTest.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const paginationOpts = { numItems: 10, cursor: null };

describe('optional campaigns', () => {
  test('requires a session on every campaign endpoint and membership change', async () => {
    const { alice, reviewId } = await fixture();
    const campaignId = await alice.mutation(api.campaigns.create, { name: 'Launch' });
    const t = setup();
    for (const attempt of [
      t.mutation(api.campaigns.create, { name: 'Launch' }),
      t.mutation(api.campaigns.update, { campaignId, name: 'Changed' }),
      t.query(api.campaigns.list, { paginationOpts }),
      t.query(api.campaigns.get, { campaignId, paginationOpts }),
      t.mutation(api.reviews.setCampaign, { reviewId, campaignId }),
    ])
      await expect(attempt).rejects.toThrow('Sign in');
  });

  test('isolates create, update, list, search, get, and both sides of membership', async () => {
    const { alice, bob, input, reviewId } = await fixture();
    const campaignId = await alice.mutation(api.campaigns.create, { name: 'Private launch' });
    const otherId = await bob.mutation(api.campaigns.create, { name: 'Other launch' });
    expect(
      (await bob.query(api.campaigns.list, { paginationOpts })).page.map((c) => c._id),
    ).toEqual([otherId]);
    expect(
      (await bob.query(api.campaigns.list, { paginationOpts, search: 'Private' })).page,
    ).toEqual([]);
    const bobAsset = await bob.mutation(api.assets.createText, { name: 'Owned', text: 'Private' });
    const bobReview = await bob.mutation(api.reviews.create, { ...input, assetIds: [bobAsset] });
    for (const attempt of [
      bob.query(api.campaigns.get, { campaignId, paginationOpts }),
      bob.mutation(api.campaigns.update, { campaignId, name: 'Stolen' }),
      bob.mutation(api.reviews.create, { ...input, assetIds: [bobAsset], campaignId }),
      bob.mutation(api.reviews.setCampaign, { reviewId: bobReview, campaignId }),
      bob.mutation(api.reviews.setCampaign, { reviewId, campaignId: otherId }),
      bob.mutation(api.reviews.setCampaign, { reviewId }),
    ])
      await expect(attempt).rejects.toThrow('not found');
    expect(
      (await alice.query(api.campaigns.get, { campaignId, paginationOpts })).counts.total,
    ).toBe(0);
  });

  test('maintains exact counts through create, decisions, resubmit, retry, move, and remove', async () => {
    const { alice, t, input, reviewId, findingId } = await fixture();
    const campaignId = await alice.mutation(api.campaigns.create, {
      name: 'Launch',
      product: 'credit_card',
      offerTerms: 'Shared terms',
    });
    const destination = await alice.mutation(api.campaigns.create, { name: 'Later' });
    await alice.mutation(api.reviews.setCampaign, { reviewId, campaignId });
    await alice.mutation(api.reviews.setCampaign, { reviewId, campaignId });
    const second = await alice.mutation(api.reviews.create, {
      ...input,
      campaignId,
      title: 'Email',
      offerTerms: 'Own terms',
    });
    const detail = () => alice.query(api.campaigns.get, { campaignId, paginationOpts });
    expect((await detail()).counts).toEqual({
      needs_review: 2,
      changes_requested: 0,
      approved: 0,
      rejected: 0,
      total: 2,
    });
    const own = (await alice.query(api.reviews.get, { reviewId: second })).review;
    expect(own.product).toBe('personal_loan');
    expect(own.offerTerms).toBe('Own terms');
    expect((await detail()).submissions.page[0]?.campaignName).toBe('Launch');
    await alice.mutation(api.reviews.decide, {
      reviewId,
      version: 1,
      outcome: 'changes_requested',
    });
    expect((await detail()).counts).toMatchObject({ needs_review: 1, changes_requested: 1 });
    await alice.mutation(api.reviews.resubmit, {
      reviewId,
      assetIds: input.assetIds,
      responses: [{ findingId, text: 'Fixed' }],
    });
    expect((await detail()).counts).toMatchObject({ needs_review: 2, changes_requested: 0 });
    // Finish both analyses without an external provider.
    for (const [id, version] of [
      [reviewId, 2],
      [second, 1],
    ] as const) {
      const started = await t.mutation(internal.review.state.start, { reviewId: id, version });
      expect(started).not.toBeNull();
      if (!started) throw new Error('Missing analysis run');
      await t.mutation(internal.review.state.finish, {
        reviewId: id,
        version,
        runKey: started.runKey,
        result: null,
        error: 'Test failure',
        spans: [],
        extractions: [],
      });
    }
    await alice.mutation(api.reviews.retryAnalysis, { reviewId: second });
    expect((await detail()).counts.needs_review).toBe(2);
    const retried = await t.mutation(internal.review.state.start, { reviewId: second, version: 1 });
    if (!retried) throw new Error('Missing retry run');
    await t.mutation(internal.review.state.finish, {
      reviewId: second,
      version: 1,
      runKey: retried.runKey,
      result: null,
      spans: [],
      extractions: [],
    });
    await alice.mutation(api.reviews.decide, { reviewId, version: 2, outcome: 'approved' });
    await alice.mutation(api.reviews.decide, { reviewId: second, version: 1, outcome: 'rejected' });
    expect((await detail()).counts).toEqual({
      needs_review: 0,
      changes_requested: 0,
      approved: 1,
      rejected: 1,
      total: 2,
    });
    await alice.mutation(api.reviews.setCampaign, { reviewId, campaignId: destination });
    expect((await detail()).counts).toMatchObject({ approved: 0, rejected: 1, total: 1 });
    await alice.mutation(api.reviews.setCampaign, { reviewId: second });
    expect((await detail()).counts.total).toBe(0);
    expect(
      (await alice.query(api.campaigns.get, { campaignId: destination, paginationOpts })).counts,
    ).toMatchObject({ approved: 1, total: 1 });
    expect(
      (await alice.query(api.reviews.list, { filter: 'all', paginationOpts })).page.find(
        (r) => r._id === second,
      )?.campaignName,
    ).toBeUndefined();
  });

  test('updates context without rewriting submissions, validates input, and paginates', async () => {
    const { alice } = await fixture();
    const campaignId = await alice.mutation(api.campaigns.create, {
      name: 'Launch',
      product: 'personal_loan',
    });
    await alice.mutation(api.campaigns.update, {
      campaignId,
      name: 'Renamed',
      notes: 'New context',
    });
    const detail = await alice.query(api.campaigns.get, { campaignId, paginationOpts });
    expect(detail.campaign).toMatchObject({ name: 'Renamed', notes: 'New context' });
    expect(detail.campaign.product).toBeUndefined();
    for (const args of [{ name: ' ' }, { name: 'Invalid', goLiveDate: '2026-02-30' }])
      await expect(alice.mutation(api.campaigns.create, args)).rejects.toThrow();
    await alice.mutation(api.campaigns.create, { name: 'Second' });
    const first = await alice.query(api.campaigns.list, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    const next = await alice.query(api.campaigns.list, {
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    });
    expect(first.isDone).toBe(false);
    expect(first.page[0]?._id).not.toBe(next.page[0]?._id);
  });

  test('groups only loan examples and supplies related titles and channels to analysis', async () => {
    const { alice, bob, t, input } = await fixture();
    const social = await alice.mutation(api.reviews.create, {
      ...input,
      title: 'Social',
      example: 'personal-loan-social',
    });
    const video = await alice.mutation(api.reviews.create, {
      ...input,
      title: 'Affiliate',
      channel: 'affiliate',
      example: 'affiliate-video',
    });
    const email = await alice.mutation(api.reviews.create, {
      ...input,
      example: 'credit-card-email',
    });
    await bob.mutation(api.campaigns.create, { name: 'Private context', notes: 'Never sent' });
    const loaded = await t.mutation(internal.review.state.start, { reviewId: social, version: 1 });
    expect(loaded?.campaign).toMatchObject({
      name: 'Example campaign: Personal loan spring promo',
      relatedMaterial: [{ title: 'Affiliate', channel: 'affiliate' }],
    });
    const first = (await alice.query(api.reviews.get, { reviewId: social })).review;
    expect((await alice.query(api.reviews.get, { reviewId: video })).review.campaignId).toBe(
      first.campaignId,
    );
    expect(
      (await alice.query(api.reviews.get, { reviewId: email })).review.campaignId,
    ).toBeUndefined();
    if (!first.campaignId) throw new Error('Missing campaign');
    expect(
      (await alice.query(api.campaigns.get, { campaignId: first.campaignId, paginationOpts }))
        .counts.total,
    ).toBe(2);
  });
});
