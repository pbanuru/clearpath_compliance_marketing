import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { response, summary } from '../pipelineTest.helpers';
import { MAX_VIDEO_SECONDS, videoLengthMessage } from '../videoLimits';

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

test.each([MAX_VIDEO_SECONDS, MAX_VIDEO_SECONDS + 1, MAX_VIDEO_SECONDS + 0.01])(
  'trusted AssemblyAI duration %s enforces the video limit before review',
  async (seconds) => {
    const t = setup(),
      alice = t.withIdentity(aliceIdentity);
    const assetId = await t.run((ctx) =>
      ctx.db.insert('assets', {
        owner: aliceIdentity.tokenIdentifier,
        version: 1,
        name: 'Video',
        kind: 'video',
        content: {
          original: { key: 'video', name: 'video.mp4', mimeType: 'video/mp4', size: 3 },
          poster: { key: 'poster', name: 'poster.jpg', mimeType: 'image/jpeg', size: 3 },
          frames: [],
        },
      }),
    );
    const fetch = vi.fn((url: string) => {
      if (url.includes('assemblyai.com'))
        return Promise.resolve(
          Response.json({
            id: 'transcript',
            status: 'completed',
            audio_duration: seconds,
            words: [{ start: 0, end: 1000, text: 'Hello.' }],
          }),
        );
      if (url.endsWith('/responses'))
        return Promise.resolve(response(JSON.stringify({ summary, findings: [], previous: [] })));
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    });
    vi.stubGlobal('fetch', fetch);
    await t.mutation(internal.assetExtractionState.ensure, {
      assetIds: [assetId],
      owner: aliceIdentity.tokenIdentifier,
    });
    await t.action(internal.assetExtraction.run, { assetId, kind: 'transcript' });
    await t.run(async (ctx) => {
      const visual = await ctx.db
        .query('assetExtractions')
        .withIndex('by_assetId_and_kind', (q) =>
          q.eq('assetId', assetId).eq('kind', 'video_timeline'),
        )
        .unique();
      if (!visual) throw new Error('Missing visual extraction');
      await ctx.db.patch('assetExtractions', visual._id, {
        status: 'failed',
        error: 'Visual extraction unavailable.',
      });
    });
    const reviewId = await alice.mutation(api.reviews.create, {
      title: 'Video',
      product: 'personal_loan',
      channel: 'video_audio',
      jurisdictions: ['US'],
      assetIds: [assetId],
    });
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    const detail = await alice.query(api.reviews.get, { reviewId });
    const transcript = detail.extractions.find((e) => e.kind === 'transcript');
    expect(transcript?.durationSeconds).toBe(seconds);
    const over = seconds > MAX_VIDEO_SECONDS;
    expect(detail.versions[0]?.analysis.status).toBe(over ? 'failed' : 'succeeded');
    expect(transcript?.status).toBe(over ? 'failed' : 'succeeded');
    expect(fetch.mock.calls.filter(([url]) => url.endsWith('/responses'))).toHaveLength(
      over ? 0 : 1,
    );
    if (over) {
      expect(detail.versions[0]?.analysis.error).toBe(videoLengthMessage(seconds));
      expect(transcript?.error).toBe(videoLengthMessage(seconds));
      expect(transcript?.segments).toEqual([]);
    }
    const billed = transcript?.spans?.find(
      (s) => s.provider === 'assemblyai' && s.status === 'succeeded',
    );
    expect(billed?.usage.audioSeconds).toBe(seconds);
    expect(billed?.costUsd).toBeGreaterThan(0);
  },
);

test('registration uses the public duration limit for an oversized frame library', async () => {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const args = { name: 'Video', mimeType: 'video/mp4', size: 3, poster: { size: 3 } };
  const frames = Array.from({ length: MAX_VIDEO_SECONDS }, (_, at) => ({ at, size: 3 }));
  await expect(alice.mutation(api.assetUploads.begin, { ...args, frames })).resolves.toHaveProperty(
    'uploadId',
  );
  await expect(
    alice.mutation(api.assetUploads.begin, {
      ...args,
      frames: [...frames, { at: MAX_VIDEO_SECONDS, size: 3 }],
    }),
  ).rejects.toThrow(videoLengthMessage());
  await expect(
    alice.mutation(api.assetUploads.begin, {
      ...args,
      frames: [{ at: MAX_VIDEO_SECONDS, size: 3 }],
    }),
  ).rejects.toThrow(videoLengthMessage());
});

test('unknown video duration cannot fall through to a partial AI review', async () => {
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
        status: 'failed',
        segments: [],
        model: 'legacy',
        createdAt: Date.now(),
      });
    return id;
  });
  const fetch = vi.fn(() => Promise.reject(new Error('Unexpected model call')));
  vi.stubGlobal('fetch', fetch);
  const reviewId = await alice.mutation(api.reviews.create, {
    title: 'Video',
    product: 'personal_loan',
    channel: 'video_audio',
    jurisdictions: ['US'],
    assetIds: [assetId],
  });
  await t.action(internal.review.analysis.run, { reviewId, version: 1 });
  const detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.versions[0]?.analysis.status).toBe('failed');
  expect(detail.findings).toEqual([]);
  expect(fetch).not.toHaveBeenCalled();
});
