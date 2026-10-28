import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { setup, aliceIdentity } from '../reviewTest.helpers';
import { response } from '../pipelineTest.helpers';
import { must, fetcher } from './test.helpers';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  for (const [name, value] of Object.entries({
    R2_BUCKET: 'test',
    R2_ENDPOINT: 'https://r2.example.com',
    R2_ACCESS_KEY_ID: 'test',
    R2_SECRET_ACCESS_KEY: 'test',
    OPENAI_API_KEY: 'stub',
    ASSEMBLYAI_API_KEY: 'primary-stub',
  }))
    vi.stubEnv(name, value);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllTimers();
  vi.useRealTimers();
});

test.each(['audio', 'video'] as const)(
  'rechecks use the configured primary transcription provider for large uncached %s',
  async (kind) => {
    const t = setup(),
      alice = t.withIdentity(aliceIdentity);
    const assetId = await t.run((ctx) => {
      const original = {
        key: 'recording',
        name: 'ad.mp4',
        mimeType: kind === 'audio' ? 'audio/mpeg' : 'video/mp4',
        size: 25_000_001,
      };
      return ctx.db.insert('assets', {
        owner: aliceIdentity.tokenIdentifier,
        version: 1,
        name: 'Large recording',
        ...(kind === 'audio'
          ? { kind, content: { original } }
          : {
              kind,
              content: {
                original,
                poster: { key: 'poster', name: 'poster.jpg', mimeType: 'image/jpeg', size: 3 },
              },
            }),
      });
    });
    const reviewId = await alice.mutation(api.reviews.create, {
      title: 'Approved recording',
      product: 'personal_loan',
      channel: 'video_audio',
      jurisdictions: ['US'],
      assetIds: [assetId],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch('reviews', reviewId, { status: 'in_review' });
      const version = must(await ctx.db.query('reviewVersions').first());
      await ctx.db.patch('reviewVersions', version._id, { analysis: { status: 'failed' } });
      await ctx.db.insert('assetExtractions', {
        owner: aliceIdentity.tokenIdentifier,
        assetId,
        kind: 'transcript',
        status: 'failed',
        segments: [],
        model: 'universal-3-5-pro',
        createdAt: Date.now(),
      });
    });
    await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
    await alice.mutation(api.policies.edit, {
      key: 'advertised-rate-available',
      expectedVersion: 1,
      check: 'Include a payment example.',
      changeSummary: 'Require a payment example.',
    });
    const fetch = fetcher((url, init) => {
      if (url.includes('assemblyai.com')) {
        expect(init?.headers).toMatchObject({ authorization: 'primary-stub' });
        if (typeof init?.body !== 'string')
          throw new Error('Expected a JSON transcription request.');
        expect(init.body).toContain('r2.example.com');
        return Response.json({
          id: 'recheck-primary',
          status: 'completed',
          audio_duration: 10,
          words: [{ start: 100, end: 1200, text: 'Representative payment.' }],
        });
      }
      if (url.endsWith('/responses')) {
        if (typeof init?.body !== 'string') throw new Error('Expected a JSON review request.');
        expect(init.body).toContain('[0.10–1.20s] Representative payment.');
        return response(JSON.stringify({ summary: 'No issues.', findings: [], previous: [] }));
      }
      expect(url).not.toContain('/audio/transcriptions');
      expect(kind).toBe('video');
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const job = must(await t.run((ctx) => ctx.db.query('policyRechecks').first()));
    await t.action(internal.policy.recheck.run, { id: job._id });
    expect(fetch.mock.calls.filter(([url]) => url.includes('assemblyai.com'))).toHaveLength(1);
    expect(fetch.mock.calls.some(([url]) => url.includes('/audio/transcriptions'))).toBe(false);
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.review).toMatchObject({
      status: 'approved',
      recheckFailed: false,
      pendingRechecks: 0,
    });
    expect(detail.events.some((e) => e.type === 'recheck_passed')).toBe(true);
    expect(
      (await t.run((ctx) => ctx.db.query('aiSpans').collect())).map((span) => [
        span.provider,
        span.operation,
      ]),
    ).toEqual([
      ['assemblyai', 'transcription'],
      ['openai', 'recheck'],
    ]);
  },
);
