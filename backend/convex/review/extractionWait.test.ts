import { afterEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { response, summary } from '../pipelineTest.helpers';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('a primary timeline finishing after 90 seconds is included before the reviewer starts', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('OPENAI_API_KEY', 'stub');
  for (const [key, value] of Object.entries({
    R2_BUCKET: 'test',
    R2_ENDPOINT: 'https://r2.example',
    R2_ACCESS_KEY_ID: 'test',
    R2_SECRET_ACCESS_KEY: 'test',
  }))
    vi.stubEnv(key, value);
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const { assetId, timelineId } = await t.run(async (ctx) => {
    const file = { key: 'video', name: 'video.mp4', size: 1, mimeType: 'video/mp4' };
    const assetId = await ctx.db.insert('assets', {
      owner: aliceIdentity.tokenIdentifier,
      version: 1,
      name: 'Video',
      kind: 'video',
      content: { original: file, poster: file, frames: [{ ...file, at: 0 }] },
    });
    await ctx.db.insert('assetExtractions', {
      owner: aliceIdentity.tokenIdentifier,
      assetId,
      kind: 'transcript',
      status: 'succeeded',
      segments: [],
      durationSeconds: 22,
      model: 'universal-3-5-pro',
      createdAt: Date.now(),
    });
    const timelineId = await ctx.db.insert('assetExtractions', {
      owner: aliceIdentity.tokenIdentifier,
      assetId,
      kind: 'video_timeline',
      status: 'running',
      segments: [],
      model: 'gemini-3.1-pro-preview',
      createdAt: Date.now(),
    });
    return { assetId, timelineId };
  });
  let reviewCalls = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/responses')) {
        reviewCalls++;
        expect(init?.body).toContain('Timed disclosure');
        return Promise.resolve(response(JSON.stringify({ summary, findings: [], previous: [] })));
      }
      return Promise.resolve(new Response(new Uint8Array([1])));
    }),
  );
  const reviewId = await alice.mutation(api.reviews.create, {
    title: 'Video',
    product: 'personal_loan',
    channel: 'video_audio',
    jurisdictions: ['US'],
    assetIds: [assetId],
  });
  const analysis = t.action(internal.review.analysis.run, { reviewId, version: 1 });
  await vi.advanceTimersByTimeAsync(100000);
  expect(reviewCalls).toBe(0);
  await t.run((ctx) =>
    ctx.db.patch('assetExtractions', timelineId, {
      status: 'succeeded',
      timeline: [
        {
          start: 20,
          end: 21.5,
          kind: 'on_screen_text',
          text: 'Timed disclosure',
          size: 'small',
          contrast: 'low',
          position: 'bottom',
          notes: '',
        },
      ],
    }),
  );
  await vi.advanceTimersByTimeAsync(2000);
  await analysis;
  const detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.versions[0]?.analysis.status).toBe('succeeded');
  expect(detail.versions[0]?.analysis.extractionNotes).toEqual([]);
  expect(reviewCalls).toBe(1);
});
