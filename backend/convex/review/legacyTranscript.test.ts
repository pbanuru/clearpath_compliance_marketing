import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { response, summary } from '../pipelineTest.helpers';

// Detailed-review contracts; quick-check suites exercise the combined preview path.
vi.mock('./quickCheckRun', () => ({ runQuickCheck: () => Promise.resolve({ rules: [] }) }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  for (const [name, value] of Object.entries({
    R2_BUCKET: 'test',
    R2_ENDPOINT: 'https://r2.example.com',
    R2_ACCESS_KEY_ID: 'test',
    R2_SECRET_ACCESS_KEY: 'test',
    OPENAI_API_KEY: 'stub',
    ASSEMBLYAI_API_KEY: 'stub',
  }))
    vi.stubEnv(name, value);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test.each([false, true])(
  'legacy video transcript obtains duration once while preserving successful visual evidence (retry: %s)',
  async (retry) => {
    const t = setup(),
      alice = t.withIdentity(aliceIdentity);
    const assetId = await t.run(async (ctx) => {
      const file = { key: 'video', name: 'video.mp4', mimeType: 'video/mp4', size: 3 };
      const id = await ctx.db.insert('assets', {
        owner: aliceIdentity.tokenIdentifier,
        version: 1,
        name: 'Video',
        kind: 'video',
        content: {
          original: file,
          poster: { ...file, key: 'poster', name: 'poster.jpg', mimeType: 'image/jpeg' },
        },
      });
      for (const kind of ['transcript', 'video_timeline'] as const)
        await ctx.db.insert('assetExtractions', {
          owner: aliceIdentity.tokenIdentifier,
          assetId: id,
          kind,
          status: 'succeeded',
          segments: kind === 'transcript' ? [{ start: 0, end: 1, text: 'Legacy.' }] : [],
          timeline: kind === 'video_timeline' ? [] : undefined,
          spans: [],
          model: 'legacy',
          createdAt: Date.now(),
        });
      return id;
    });
    const args = { assetIds: [assetId], owner: aliceIdentity.tokenIdentifier };
    const before = await t.query(internal.assetExtractionState.list, args);
    const legacy = before.find((r) => r.kind === 'transcript');
    const visual = before.find((r) => r.kind === 'video_timeline');
    if (retry)
      await t.run(async (ctx) => {
        const asset = await ctx.db.get('assets', assetId);
        if (!asset) throw new Error('Missing asset');
        const { ensureExtractions } = await import('../assetExtractionState');
        await ensureExtractions(ctx, asset, true);
      });
    else await t.mutation(internal.assetExtractionState.ensure, args);
    await t.mutation(internal.assetExtractionState.ensure, args);
    const queued = await t.query(internal.assetExtractionState.list, args);
    expect(queued.find((r) => r.kind === 'transcript')).toMatchObject({
      _id: legacy?._id,
      status: 'queued',
    });
    expect(queued.find((r) => r.kind === 'video_timeline')).toEqual(visual);
    const fetch = vi.fn((url: string) => {
      if (url.includes('assemblyai.com'))
        return Promise.resolve(
          Response.json({
            id: 'job',
            status: 'completed',
            audio_duration: 22,
            words: [{ start: 0, end: 1000, text: 'Recovered.' }],
          }),
        );
      if (url.endsWith('/responses'))
        return Promise.resolve(response(JSON.stringify({ summary, findings: [], previous: [] })));
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    });
    vi.stubGlobal('fetch', fetch);
    await t.action(internal.assetExtraction.run, { assetId, kind: 'transcript' });
    await t.action(internal.assetExtraction.run, { assetId, kind: 'transcript' });
    const recovered = await t.query(internal.assetExtractionState.list, args);
    expect(recovered.find((r) => r.kind === 'transcript')).toMatchObject({
      _id: legacy?._id,
      status: 'succeeded',
      durationSeconds: 22,
    });
    expect(recovered.find((r) => r.kind === 'video_timeline')).toEqual(visual);
    await t.mutation(internal.assetExtractionState.ensure, args);
    expect(await t.query(internal.assetExtractionState.list, args)).toEqual(recovered);
    const reviewId = await alice.mutation(api.reviews.create, {
      title: 'Video',
      product: 'personal_loan',
      channel: 'video_audio',
      jurisdictions: ['US'],
      assetIds: [assetId],
    });
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    expect((await alice.query(api.reviews.get, { reviewId })).versions[0]?.analysis.status).toBe(
      'succeeded',
    );
    expect(fetch.mock.calls.filter(([url]) => url.includes('assemblyai.com'))).toHaveLength(1);
  },
);
