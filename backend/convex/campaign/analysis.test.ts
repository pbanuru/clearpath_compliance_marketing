import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { response } from '../pipelineTest.helpers';

// Detailed campaign context; quick-check tests cover campaign/risk integration.
vi.mock('../review/quickCheckRun', () => ({ runQuickCheck: () => Promise.resolve({ rules: [] }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('OPENAI_API_KEY', 'stub-key');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('analysis sends current campaign context and related titles without related asset contents', async () => {
  const { alice, bob, t, input, reviewId } = await fixture();
  const campaignId = await alice.mutation(api.campaigns.create, {
    name: 'Spring launch',
    offerTerms: 'Shared APR range',
    notes: 'Shared launch notes',
  });
  await alice.mutation(api.reviews.setCampaign, { reviewId, campaignId });
  const target = await alice.mutation(api.reviews.create, {
    ...input,
    campaignId,
    title: 'Email',
    channel: 'email',
    offerTerms: 'Submission terms',
  });
  const separateAsset = await alice.mutation(api.assets.createText, {
    name: 'Separate material',
    text: 'RELATED ASSET CONTENT MUST NOT BE SENT',
  });
  await alice.mutation(api.reviews.create, {
    ...input,
    campaignId,
    assetIds: [separateAsset],
    title: 'Related landing page',
    channel: 'landing_page',
  });
  await bob.mutation(api.campaigns.create, { name: 'PRIVATE CAMPAIGN', notes: 'PRIVATE NOTES' });
  await alice.mutation(api.campaigns.update, {
    campaignId,
    name: 'Updated spring launch',
    offerTerms: 'Updated shared APR range',
    notes: 'Updated shared notes',
  });
  const fetch = vi.fn((_url: unknown, init?: RequestInit) => {
    if (typeof init?.body !== 'string') throw new Error('Expected a JSON review request');
    const body = init.body;
    expect(body).toContain('Updated spring launch');
    expect(body).toContain('Updated shared APR range');
    expect(body).toContain('Updated shared notes');
    expect(body).toContain('Submission terms');
    expect(body).toContain('Related landing page');
    expect(body).toContain('landing_page');
    expect(body).not.toContain('RELATED ASSET CONTENT MUST NOT BE SENT');
    expect(body).not.toContain('PRIVATE CAMPAIGN');
    expect(body).not.toContain('PRIVATE NOTES');
    return Promise.resolve(
      response(JSON.stringify({ summary: 'Checked.', findings: [], previous: [] })),
    );
  });
  vi.stubGlobal('fetch', fetch);
  await t.action(internal.review.analysis.run, { reviewId: target, version: 1 });
  expect(fetch).toHaveBeenCalledOnce();
  const data = await alice.query(api.reviews.get, { reviewId: target });
  expect(data.versions[0]?.analysis.status).toBe('succeeded');
  const queue = await alice.query(api.reviews.list, {
    filter: 'all',
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(queue.page.find((r) => r._id === target)?.campaignName).toBe('Updated spring launch');
});
