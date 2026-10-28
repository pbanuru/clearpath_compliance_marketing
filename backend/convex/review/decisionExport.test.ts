import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { decisionCsv } from '../../../expo/src/features/review/queue/csv';
import { persistSpans, insertSpans } from './usage';
import type { Span } from './openai';
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
test('decision export isolates owners and emits one row per decision plus undecided submissions', async () => {
  const { t, alice, bob, reviewId, findingId, input } = await fixture();
  const pending = await alice.mutation(api.reviews.create, { ...input, title: 'Undecided' });
  await alice.mutation(api.reviews.decide, {
    reviewId,
    version: 1,
    outcome: 'changes_requested',
    note: 'Fix the claim, please.',
  });
  await alice.mutation(api.reviews.resubmit, {
    reviewId,
    assetIds: input.assetIds,
    responses: [{ findingId, text: 'Fixed' }],
  });
  await t.run(async (ctx) => {
    await ctx.db.patch('reviews', reviewId, { status: 'in_review' });
  });
  await alice.mutation(api.reviews.decide, {
    reviewId,
    version: 2,
    outcome: 'approved',
    note: 'Approved revised material.',
  });
  for (let i = 0; i < 22; i++)
    await alice.mutation(api.reviews.create, { ...input, title: `Pending ${i}` });
  const rows = await alice.action(api.reviews.exportDecisions, { filter: 'all' });
  expect(rows).toHaveLength(25);
  expect(rows.filter((r) => r.reviewId === reviewId).map((r) => [r.version, r.outcome])).toEqual([
    [1, 'changes_requested'],
    [2, 'approved'],
  ]);
  expect(rows.find((r) => r.reviewId === pending)).toMatchObject({
    outcome: '',
    decidedAt: '',
    aiCostUsd: null,
  });
  expect(rows.filter((r) => r.reviewId === reviewId).every((r) => r.dismissedCount === 0)).toBe(
    true,
  );
  expect(rows.find((r) => r.version === 1 && r.reviewId === reviewId)?.acceptedFindings).toBe(
    'Remove guarantee',
  );
  expect(await bob.action(api.reviews.exportDecisions, { filter: 'all' })).toEqual([]);
  expect(await alice.action(api.reviews.exportDecisions, { filter: 'approved' })).toHaveLength(2);
  await expect(t.action(api.reviews.exportDecisions, { filter: 'all' })).rejects.toThrow('Sign in');
});
test('CSV has a BOM, quoted cells, CRLF, escaped quotes, line breaks, and safe spreadsheet values', () => {
  const csv = decisionCsv([['=HYPERLINK("bad")', 'Comma, quote " and\nnew line', 2]]);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  expect(csv).toContain('"Comma, quote "" and\nnew line"');
  expect(csv).toContain('\r\n');
  expect(csv.endsWith('\r\n')).toBe(true);
});

test.each([false, true])(
  'decision costs include unique version assets, retries, and unknown extraction billing (%s)',
  async (unknown) => {
    const { t, alice, bob, reviewId, input, findingId } = await fixture();
    const makeSpan = (costUsd: number | null): Span => ({
      provider: 'openai',
      operation: 'review',
      model: 'gpt-6.1-sol',
      attempt: 1,
      status: 'succeeded',
      startedAt: Date.now(),
      durationMs: 1,
      usage: {},
      costUsd,
      costBasis: costUsd === null ? 'unknown' : 'rate_estimate',
      pricingVersion: 'test',
    });
    const assets = await t.run(async (ctx) => {
      const review = await ctx.db.get('reviews', reviewId);
      if (!review) throw new Error('Missing review');
      const ids = [];
      for (const kind of ['video', 'audio'] as const) {
        const file = { key: kind, name: kind, mimeType: `${kind}/mp4`, size: 1 };
        const assetId = await ctx.db.insert('assets', {
          owner: review.owner,
          version: 1,
          name: kind,
          ...(kind === 'video'
            ? { kind, content: { original: file, poster: file } }
            : { kind, content: { original: file } }),
        });
        ids.push(assetId);
        for (const layer of kind === 'video'
          ? (['transcript', 'video_timeline'] as const)
          : (['transcript'] as const)) {
          const span: Span = {
            ...makeSpan(layer === 'video_timeline' && unknown ? null : 0.02),
            provider: layer === 'transcript' ? 'assemblyai' : 'gemini',
            operation: layer === 'transcript' ? 'transcription' : 'video_analysis',
          };
          const retry: Span = { ...makeSpan(0.01), status: 'failed', attempt: 2 };
          const runKey = `${assetId}:${layer}`;
          await persistSpans(ctx, { owner: review.owner, assetId }, runKey, [span, retry]);
          await ctx.db.insert('assetExtractions', {
            owner: review.owner,
            assetId,
            kind: layer,
            status: 'succeeded',
            segments: [],
            durationSeconds: 22,
            spans: [span, retry],
            model: 'test',
            createdAt: Date.now(),
          });
        }
      }
      // Owner-mismatched rows must never inflate the aggregate.
      await ctx.db.insert('aiSpans', {
        ...makeSpan(500),
        owner: 'other',
        reviewId,
        version: 1,
        runKey: 'other',
      });
      const version = await ctx.db
        .query('reviewVersions')
        .withIndex('by_reviewId_and_number', (q) => q.eq('reviewId', reviewId).eq('number', 1))
        .unique();
      if (!version) throw new Error('Missing version');
      const [video, audio] = ids;
      if (!video || !audio) throw new Error('Missing media fixtures');
      await ctx.db.patch('reviewVersions', version._id, {
        assetIds: [video, video, audio],
      });
      await insertSpans(ctx, review, 1, 'review-first', [makeSpan(0.1)]);
      return { video, audio };
    });
    await alice.mutation(api.reviews.decide, {
      reviewId,
      version: 1,
      outcome: 'changes_requested',
    });
    await alice.mutation(api.reviews.resubmit, {
      reviewId,
      assetIds: [...input.assetIds, assets.audio, assets.audio],
      responses: [{ findingId, text: 'Revised' }],
    });
    await t.run(async (ctx) => {
      const review = await ctx.db.get('reviews', reviewId);
      if (!review) throw new Error('Missing review');
      await insertSpans(ctx, review, 2, 'review-second', [makeSpan(0.2)]);
      await ctx.db.patch('reviews', reviewId, { status: 'in_review' });
    });
    await alice.mutation(api.reviews.decide, { reviewId, version: 2, outcome: 'approved' });
    const rows = (await alice.action(api.reviews.exportDecisions, { filter: 'all' })).filter(
      (r) => r.reviewId === reviewId,
    );
    expect(rows).toHaveLength(2);
    // Three layers at .02 + .01 each, counted once despite duplicated assets.
    if (unknown) expect(rows.find((r) => r.version === 1)?.aiCostUsd).toBeNull();
    else expect(rows.find((r) => r.version === 1)?.aiCostUsd).toBeCloseTo(0.19);
    // Version 2 reuses only audio: no charge for the removed video's layers.
    expect(rows.find((r) => r.version === 2)?.aiCostUsd).toBeCloseTo(0.23);
    await expect(
      bob.query(internal.review.decisionExport.assetCosts, { reviewId, version: 1 }),
    ).rejects.toThrow('Review not found');
  },
);
