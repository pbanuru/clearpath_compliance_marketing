import { output, queued, response, summary, tokens } from '../pipelineTest.helpers';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { price } from './pricing';

vi.stubEnv('R2_BUCKET', 'test-assets');
vi.stubEnv('R2_ENDPOINT', 'https://example.r2.cloudflarestorage.com');
vi.stubEnv('R2_ACCESS_KEY_ID', 'test-id');
vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
vi.stubEnv('OPENAI_API_KEY', 'stub-key');
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.stubEnv('OPENAI_API_KEY', 'stub-key');
});
describe('AI review pipeline and cost contract', () => {
  test('stubbed response commits findings, spans, usage and events together; duplicate execution is free', async () => {
    const { t, alice, reviewId, assetId } = await queued();
    const fetch = vi.fn(() => Promise.resolve(response(JSON.stringify(output(assetId)))));
    vi.stubGlobal('fetch', fetch);
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.review).toMatchObject({ status: 'in_review', counts: { required: 1 } });
    expect(detail.findings[0]).toMatchObject({
      status: 'open',
      quoteFound: true,
      confidence: 'high',
    });
    expect(detail.versions[0]?.analysis).toMatchObject({ status: 'succeeded', summary });
    expect(detail.events.map((e) => e.type)).toEqual([
      'submitted',
      'analysis_started',
      'analysis_finished',
    ]);
    const rows = await t.run(async (ctx) => ({
      spans: await ctx.db.query('aiSpans').collect(),
      daily: await ctx.db.query('aiUsageDaily').collect(),
    }));
    expect(rows.spans[0]).toMatchObject({
      status: 'succeeded',
      requestId: 'req_stub',
      costBasis: 'rate_estimate',
      usage: { inputTokens: 1000, cachedInputTokens: 200, outputTokens: 100, reasoningTokens: 50 },
    });
    expect(rows.spans[0]?.costUsd).toBeCloseTo(0.00262);
    expect(rows.daily[0]).toMatchObject({ calls: 1, failedCalls: 0, unknownCostCalls: 0 });
    expect(rows.daily[0]?.knownCostUsd).toBeCloseTo(0.00262);
    expect(detail.cost).toMatchObject({ spans: 1, unknownCalls: 0 });
  });
  test('a billed parse failure retries once, recording both attempts and their usage', async () => {
    const { t, alice, reviewId, assetId } = await queued();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response('{bad'))
      .mockResolvedValueOnce(response(JSON.stringify(output(assetId, 'not in the source'))));
    vi.stubGlobal('fetch', fetch);
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.findings[0]?.quoteFound).toBe(false);
    const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
    expect(spans.map((s) => [s.attempt, s.status])).toEqual([
      [1, 'failed'],
      [2, 'succeeded'],
    ]);
    expect(spans.every((s) => s.costUsd !== null)).toBe(true);
    const daily = await t.run((ctx) => ctx.db.query('aiUsageDaily').first());
    expect(daily).toMatchObject({ calls: 2, failedCalls: 1, unknownCostCalls: 0 });
    expect(daily?.knownCostUsd).toBeCloseTo(0.00524);
  });
  test('two failed parses leave a readable retryable failure with both spans', async () => {
    const { t, alice, reviewId } = await queued();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response('{bad'))),
    );
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.review.status).toBe('in_review');
    expect(detail.versions[0]?.analysis.status).toBe('failed');
    expect(detail.versions[0]?.analysis.error).toBeTruthy();
    expect(detail.cost.spans).toBe(2);
    await alice.mutation(api.reviews.retryAnalysis, { reviewId });
    expect((await alice.query(api.reviews.get, { reviewId })).versions[0]?.analysis.status).toBe(
      'queued',
    );
  });
  test('unknown model or missing usage stays null and increments unknown calls', async () => {
    const { t, alice, reviewId } = await queued();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          response(
            JSON.stringify({ summary, findings: [], previous: [] }),
            tokens,
            'unknown-model',
          ),
        ),
      ),
    );
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    const span = await t.run((ctx) => ctx.db.query('aiSpans').first());
    expect(span).toMatchObject({ costUsd: null, costBasis: 'unknown' });
    expect(await t.run((ctx) => ctx.db.query('aiUsageDaily').first())).toMatchObject({
      knownCostUsd: 0,
      unknownCostCalls: 1,
      calls: 1,
    });
    expect((await alice.query(api.reviews.get, { reviewId })).cost).toEqual({
      knownUsd: 0,
      unknownCalls: 1,
      spans: 1,
    });
    expect(price('gpt-6.1-sol', {})).toBeNull();
  });
  test('resubmission passes responses and resolves the old accepted finding', async () => {
    const { t, alice, reviewId, findingId, input } = await fixture();
    await alice.mutation(api.reviews.decide, {
      reviewId,
      version: 1,
      outcome: 'changes_requested',
    });
    await alice.mutation(api.reviews.resubmit, {
      reviewId,
      assetIds: input.assetIds,
      responses: [{ findingId, text: 'Removed the guarantee.' }],
      note: 'Revised.',
    });
    const fetch = vi.fn((_input: unknown, init?: RequestInit) => {
      expect(init?.body).toContain('Removed the guarantee.');
      return Promise.resolve(
        response(
          JSON.stringify({
            summary: 'The guarantee has been removed. No new issues were found.',
            findings: [],
            previous: [{ findingId, status: 'resolved', note: 'The guarantee is gone.' }],
          }),
        ),
      );
    });
    vi.stubGlobal('fetch', fetch);
    await t.action(internal.review.analysis.run, { reviewId, version: 2 });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.review.currentVersion).toBe(2);
    expect(detail.findings.find((f) => f._id === findingId)).toMatchObject({
      status: 'resolved',
      recheckNote: 'The guarantee is gone.',
    });
    expect(detail.versions[1]?.analysis.status).toBe('succeeded');
  });
  test('missing API key makes a manual review possible without inventing a paid span', async () => {
    const { t, alice, reviewId } = await queued();
    vi.stubEnv('OPENAI_API_KEY', '');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.review.status).toBe('in_review');
    expect(detail.versions[0]?.analysis.error).toContain('OPENAI_API_KEY is missing');
    expect(detail.cost.spans).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});

test('429 retries once and keeps the unknown first charge; a 400 fails immediately', async () => {
  const first = await queued();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ error: { message: 'Rate limited' } }, { status: 429 }))
    .mockResolvedValueOnce(response(JSON.stringify(output(first.assetId))));
  vi.stubGlobal('fetch', fetch);
  await first.t.action(internal.review.analysis.run, { reviewId: first.reviewId, version: 1 });
  expect(fetch).toHaveBeenCalledTimes(2);
  const spans = await first.t.run((ctx) => ctx.db.query('aiSpans').collect());
  expect(spans.map((s) => s.status)).toEqual(['failed', 'succeeded']);
  expect(spans[0]?.costUsd).toBeNull();
  expect(await first.t.run((ctx) => ctx.db.query('aiUsageDaily').first())).toMatchObject({
    calls: 2,
    unknownCostCalls: 1,
    failedCalls: 1,
  });
  const second = await queued();
  const badFetch = vi.fn(() =>
    Promise.resolve(Response.json({ error: { message: 'Unsupported input' } }, { status: 400 })),
  );
  vi.stubGlobal('fetch', badFetch);
  await second.t.action(internal.review.analysis.run, { reviewId: second.reviewId, version: 1 });
  expect(badFetch).toHaveBeenCalledTimes(1);
  expect(
    (await second.alice.query(api.reviews.get, { reviewId: second.reviewId })).versions[0]?.analysis
      .error,
  ).toBe('OpenAI review failed (400): Unsupported input');
});

test('still-present rechecks keep the old note and link the new finding; unknown policies normalize', async () => {
  const { t, alice, reviewId, findingId, input } = await fixture();
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'changes_requested' });
  await alice.mutation(api.reviews.resubmit, {
    reviewId,
    assetIds: input.assetIds,
    responses: [{ findingId, text: 'Please check again.' }],
  });
  const assetId = input.assetIds[0];
  if (!assetId) throw new Error('Missing asset');
  const result = output(assetId);
  if (result.findings[0]) result.findings[0].policyId = 'invented-rule';
  const complete = {
    ...result,
    previous: [{ findingId, status: 'still_present', note: 'The guarantee is unchanged.' }],
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(response(JSON.stringify(complete)))),
  );
  await t.action(internal.review.analysis.run, { reviewId, version: 2 });
  const detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.findings.find((f) => f._id === findingId)).toMatchObject({
    status: 'accepted',
    recheckNote: 'The guarantee is unchanged.',
  });
  expect(detail.findings.find((f) => f.previousFindingId === findingId)).toMatchObject({
    version: 2,
    status: 'open',
  });
  expect(detail.findings.some((f) => f.version === 2 && f.policyId === 'other')).toBe(true);
});
