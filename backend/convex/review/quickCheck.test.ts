import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { queued, response, output } from '../pipelineTest.helpers';
import { applicablePolicies } from './policies';
import { band, contextHash, questions, parseQuickCheck } from './quickCheckLogic';
import { price } from './pricing';
import { record } from './parsing';
import { CLEARPATH_FACTS } from './prompt';

vi.stubEnv('OPENAI_API_KEY', 'test-key');
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function decisionBody(product = 'personal_loan', channel = 'social') {
  return {
    model: 'gpt-6-luna',
    answers: applicablePolicies(product, channel).map((r, i) => ({
      name: r.id,
      type: 'predicate',
      probability: i === 0 ? 0.92 : i === 1 ? 0.5 : 0.1,
    })),
    usage: {
      input_tokens: 1000,
      input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
      output_tokens: 0,
    },
  };
}
async function fixture() {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const bob = t.withIdentity({ subject: 'bob', issuer: 'https://auth.example' });
  const assetId = await alice.mutation(api.assets.createText, {
    name: 'Ad',
    text: 'Guaranteed approval.',
  });
  const input = {
    assetIds: [assetId],
    product: 'personal_loan' as const,
    channel: 'social' as const,
    jurisdictions: ['US'],
  };
  return { t, alice, bob, assetId, input };
}
describe('Decisions contract', () => {
  test('questions filter product and channel independently; every rule has shared facts and a unique predicate', () => {
    const social = questions('personal_loan', 'social');
    expect(social.map((q) => q.name)).toContain('meta-personal-attributes');
    expect(social.map((q) => q.name)).not.toContain('google-ads-personal-loans');
    expect(social.every((q) => q.instructions.includes(CLEARPATH_FACTS))).toBe(true);
    expect(new Set(social.map((q) => q.name)).size).toBe(social.length);
    expect(questions('personal_loan', 'search').map((q) => q.name)).toContain(
      'google-ads-personal-loans',
    );
    expect(questions('credit_card', 'search').map((q) => q.name)).not.toContain(
      'google-ads-personal-loans',
    );
    expect(questions('credit_card', 'email').map((q) => q.name)).toContain('email-can-spam');
    expect(questions('personal_loan', 'social').map((q) => q.name)).not.toContain(
      'card-promo-rate',
    );
  });
  test('band boundaries are exact; refusals remain unassessed and malformed answers fail closed', () => {
    expect([0, 0.349999, 0.35, 0.699999, 0.7, 1].map(band)).toEqual([
      'low',
      'low',
      'possible',
      'possible',
      'likely',
      'likely',
    ]);
    const body = decisionBody();
    const first = body.answers[0];
    if (!first) throw new Error('Missing rule');
    const refusal = {
      ...body,
      answers: [{ name: first.name, type: 'refusal' }, ...body.answers.slice(1)],
    };
    expect(parseQuickCheck(refusal, 'personal_loan', 'social')[0]).toMatchObject({
      probability: null,
      band: null,
      refusal: true,
    });
    expect(() => parseQuickCheck({ ...body, answers: [] }, 'personal_loan', 'social')).toThrow(
      'incomplete',
    );
    expect(() =>
      parseQuickCheck(
        { ...body, answers: [first, first, ...body.answers.slice(2)] },
        'personal_loan',
        'social',
      ),
    ).toThrow('duplicate');
    expect(() =>
      parseQuickCheck(
        { ...body, answers: [{ ...first, probability: 2 }, ...body.answers.slice(1)] },
        'personal_loan',
        'social',
      ),
    ).toThrow('invalid probability');
  });
  test('Decisions cost counts uncached, cache reads and writes once; output is free', () => {
    expect(price('gpt-6-luna', { inputTokens: 1_000_000, outputTokens: 9000 })).toBeCloseTo(0.2);
    expect(
      price('gpt-6-luna', {
        inputTokens: 1000,
        cachedInputTokens: 200,
        cacheWriteTokens: 100,
        outputTokens: 9999,
      }),
    ).toBeCloseTo(0.0000845);
    expect(price('gpt-6-luna', {})).toBeNull();
    expect(price('gpt-6-luna', { inputTokens: 10, cachedInputTokens: 11 })).toBeNull();
    expect(price('gpt-6-luna', { inputTokens: -1 })).toBeNull();
  });
});
test('cached owner-scoped check avoids another provider call; context changes invalidate it', async () => {
  const { t, alice, input } = await fixture();
  const fetch = vi.fn((_url: string, init: RequestInit) => {
    if (typeof init.body !== 'string') throw new Error('Expected JSON request');
    const body: unknown = JSON.parse(init.body);
    const input = record(body).input;
    if (!Array.isArray(input)) throw new Error('Expected messages');
    const message = record(input[0]);
    expect(message.role).toBe('user');
    if (!Array.isArray(message.content)) throw new Error('Expected content');
    expect(message.content[0]).toMatchObject({
      type: 'input_json',
      data: { product: 'personal_loan' },
    });
    expect(record(message.content[1]).text).toContain('Asset');
    return Promise.resolve(Response.json(decisionBody()));
  });
  vi.stubGlobal('fetch', fetch);
  const first = await alice.action(api.quickCheck.forAssets, input);
  const second = await alice.action(api.quickCheck.forAssets, {
    ...input,
    notes: '',
    offerTerms: '',
  });
  expect(second._id).toBe(first._id);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(first.status).toBe('succeeded');
  const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
  expect(spans).toHaveLength(1);
  expect(spans[0]).toMatchObject({
    operation: 'quick_check',
    model: 'gpt-6-luna',
    quickCheckId: first._id,
    usage: { inputTokens: 1000, cachedInputTokens: 200, cacheWriteTokens: 100 },
  });
  expect(spans[0]?.costUsd).toBeCloseTo(0.0000845);
  expect(await t.run((ctx) => ctx.db.query('aiUsageDaily').first())).toMatchObject({
    calls: 1,
    operation: 'quick_check',
    knownCostUsd: 0.0000845,
  });
  await alice.action(api.quickCheck.forAssets, { ...input, offerTerms: 'APR 10%–20%' });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(await contextHash(input)).toBe(await contextHash({ notes: '', offerTerms: '', ...input }));
});
test('owner isolation checks assets and cache reads before making a call', async () => {
  const { t, alice, bob, input } = await fixture();
  const fetch = vi.fn(() => Promise.resolve(Response.json(decisionBody())));
  vi.stubGlobal('fetch', fetch);
  await expect(bob.action(api.quickCheck.forAssets, input)).rejects.toThrow('Asset not found');
  await expect(t.action(api.quickCheck.forAssets, input)).rejects.toThrow('Sign in');
  expect(fetch).not.toHaveBeenCalled();
  const check = await alice.action(api.quickCheck.forAssets, input);
  expect(await bob.query(api.quickCheck.get, { id: check._id })).toBeNull();
  expect(await alice.query(api.quickCheck.get, { id: check._id })).toMatchObject({
    owner: aliceIdentity.tokenIdentifier,
  });
});
test('automatic quick check is visible before detailed findings, supplies leads, and exposes queue counts', async () => {
  const { t, alice, reviewId, assetId } = await queued();
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (url.endsWith('/decisions')) return Response.json(decisionBody());
    expect(url).toMatch(/\/responses$/);
    const during = await alice.query(api.reviews.get, { reviewId });
    expect(during.versions[0]?.quickCheck?.status).toBe('succeeded');
    expect(during.versions[0]?.analysis.status).toBe('running');
    expect(init.body).toContain('treat them as leads to verify');
    expect(init.body).toContain('0.92');
    return response(JSON.stringify(output(assetId)));
  });
  vi.stubGlobal('fetch', fetch);
  await t.action(internal.review.analysis.run, { reviewId, version: 1 });
  expect(fetch).toHaveBeenCalledTimes(2);
  const detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.versions[0]?.analysis.status).toBe('succeeded');
  expect(detail.cost.spans).toBe(2);
  const page = await alice.query(api.reviews.list, {
    filter: 'all',
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(page.page[0]?.quickRisk).toEqual({ likely: 1, possible: 1 });
  await t.action(internal.review.analysis.run, { reviewId, version: 1 });
  expect(fetch).toHaveBeenCalledTimes(2);
});
test('analysis reuses the pre-submit check and a quick-check failure does not block detailed review', async () => {
  const { t, alice, reviewId, assetId } = await queued();
  const fetch = vi.fn((url: string) =>
    Promise.resolve(
      url.endsWith('/decisions')
        ? Response.json(decisionBody())
        : response(JSON.stringify(output(assetId))),
    ),
  );
  vi.stubGlobal('fetch', fetch);
  const check = await alice.action(api.quickCheck.forAssets, {
    assetIds: [assetId],
    product: 'personal_loan',
    channel: 'social',
    jurisdictions: ['US'],
  });
  await t.action(internal.review.analysis.run, { reviewId, version: 1 });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect((await alice.query(api.reviews.get, { reviewId })).versions[0]?.quickCheck?._id).toBe(
    check._id,
  );
  const other = await queued();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith('/decisions')
          ? Response.json({ error: { message: 'Unavailable' } }, { status: 400 })
          : response(JSON.stringify(output(other.assetId))),
      ),
    ),
  );
  await other.t.action(internal.review.analysis.run, { reviewId: other.reviewId, version: 1 });
  const detail = await other.alice.query(api.reviews.get, { reviewId: other.reviewId });
  expect(detail.versions[0]?.analysis.status).toBe('succeeded');
  expect(detail.versions[0]?.quickCheck).toMatchObject({
    status: 'failed',
    error: 'OpenAI quick_check failed (400): Unavailable',
  });
});
