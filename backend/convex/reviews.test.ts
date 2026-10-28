import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api } from './_generated/api';
import { fixture, setup } from './reviewTest.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
const paginationOpts = { numItems: 10, cursor: null };
describe('review public contract', () => {
  test('every public endpoint requires a session', async () => {
    const { reviewId, findingId, input } = await fixture();
    const t = setup();
    for (const promise of [
      t.mutation(api.reviews.create, input),
      t.query(api.reviews.list, { filter: 'all', paginationOpts }),
      t.query(api.reviews.counts, {}),
      t.query(api.reviews.get, { reviewId }),
      t.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' }),
      t.mutation(api.reviews.resubmit, { reviewId, assetIds: input.assetIds, responses: [] }),
      t.mutation(api.reviews.retryAnalysis, { reviewId }),
      t.mutation(api.findings.setStatus, { findingId, status: 'open' }),
      t.mutation(api.findings.edit, { findingId, title: 'New title' }),
      t.mutation(api.findings.add, {
        reviewId,
        severity: 'required',
        policyId: 'other',
        title: 'Title',
        explanation: 'Reason',
      }),
      t.query(api.policies.list, {}),
    ])
      await expect(promise).rejects.toThrow('Sign in');
  });
  test('isolates every public data function by owner', async () => {
    const { alice, bob, reviewId, findingId, input } = await fixture();
    expect(
      (await alice.query(api.reviews.list, { filter: 'all', paginationOpts })).page[0]?.cover,
    ).toEqual({ kind: 'text', name: 'Ad' });
    expect((await bob.query(api.reviews.list, { filter: 'all', paginationOpts })).page).toEqual([]);
    expect(await bob.query(api.reviews.counts, {})).toEqual({
      needs_review: 0,
      changes_requested: 0,
      approved: 0,
      all: 0,
    });
    expect(await bob.query(api.policies.list, {})).toHaveLength(19);
    expect((await alice.query(api.reviews.get, { reviewId })).versions[0]?.assets[0]?._id).toBe(
      input.assetIds[0],
    );
    const attempts = [
      bob.mutation(api.reviews.create, input),
      bob.query(api.reviews.get, { reviewId }),
      bob.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' }),
      bob.mutation(api.reviews.resubmit, { reviewId, assetIds: input.assetIds, responses: [] }),
      bob.mutation(api.reviews.retryAnalysis, { reviewId }),
      bob.mutation(api.findings.setStatus, { findingId, status: 'open' }),
      bob.mutation(api.findings.edit, { findingId, title: 'Changed' }),
      bob.mutation(api.findings.add, {
        reviewId,
        severity: 'required',
        policyId: 'other',
        title: 'Title',
        explanation: 'Reason',
      }),
    ];
    for (const attempt of attempts) await expect(attempt).rejects.toThrow('not found');
  });
  test('blocks stale decisions and approval with accepted findings, dismisses open findings', async () => {
    const { alice, reviewId, findingId } = await fixture();
    await expect(
      alice.mutation(api.reviews.decide, { reviewId, version: 0, outcome: 'approved' }),
    ).rejects.toThrow('stale');
    await expect(
      alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' }),
    ).rejects.toThrow('Dismiss or resolve');
    await alice.mutation(api.findings.edit, {
      findingId,
      severity: 'recommended',
      title: 'Check guarantee',
    });
    await alice.mutation(api.findings.setStatus, { findingId, status: 'open' });
    await expect(
      alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'changes_requested' }),
    ).rejects.toThrow('Accept a finding');
    await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.findings[0]).toMatchObject({
      status: 'dismissed',
      dismissReason: 'Not raised in decision',
    });
    expect(detail.review.status).toBe('approved');
    expect(detail.review.counts).toEqual({ required: 0, recommended: 0, needs_context: 0 });
    expect(await alice.query(api.reviews.counts, {})).toEqual({
      needs_review: 0,
      changes_requested: 0,
      approved: 1,
      all: 1,
    });
  });
  test('resubmits with responses and prioritizes v2 while freezing the old version', async () => {
    const { alice, reviewId, findingId, input } = await fixture();
    await alice.mutation(api.reviews.decide, {
      reviewId,
      version: 1,
      outcome: 'changes_requested',
    });
    const freshId = await alice.mutation(api.reviews.create, { ...input, title: 'Fresh ad' });
    await alice.mutation(api.reviews.resubmit, {
      reviewId,
      assetIds: input.assetIds,
      responses: [{ findingId, text: 'Removed.' }],
      note: 'Updated copy',
    });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(detail.versions[1]).toMatchObject({
      responses: [{ findingId, text: 'Removed.' }],
      analysis: { status: 'queued' },
    });
    expect(
      (await alice.query(api.reviews.list, { filter: 'needs_review', paginationOpts })).page.map(
        (r) => r._id,
      ),
    ).toEqual([reviewId, freshId]);
    await expect(
      alice.mutation(api.findings.edit, { findingId, title: 'Too late' }),
    ).rejects.toThrow('current-version');
    await expect(
      alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' }),
    ).rejects.toThrow('stale');
  });
  test('requires owned assets, a current accepted response, and a failed analysis to retry', async () => {
    const { alice, bob, reviewId, input } = await fixture();
    await expect(alice.mutation(api.reviews.create, { ...input, assetIds: [] })).rejects.toThrow(
      'Choose between',
    );
    const foreign = await bob.mutation(api.assets.createText, { name: 'Private', text: 'secret' });
    await expect(
      alice.mutation(api.reviews.create, { ...input, assetIds: [foreign] }),
    ).rejects.toThrow('Asset not found');
    await expect(alice.mutation(api.reviews.retryAnalysis, { reviewId })).rejects.toThrow(
      'Only failed',
    );
  });
});
