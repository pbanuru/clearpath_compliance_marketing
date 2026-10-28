import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { applicablePolicies } from './policies';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('R2_BUCKET', 'test-assets');
  vi.stubEnv('R2_ENDPOINT', 'https://example.r2.cloudflarestorage.com');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'test-id');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
  vi.stubEnv('OPENAI_API_KEY', 'test-key');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function answer() {
  return Response.json({
    model: 'gpt-6-luna',
    answers: applicablePolicies('personal_loan', 'social').map((rule) => ({
      name: rule.id,
      type: 'predicate',
      probability: 0.2,
    })),
    usage: { input_tokens: 100, output_tokens: 0 },
  });
}
const context = {
  product: 'personal_loan' as const,
  channel: 'social' as const,
  jurisdictions: ['US'],
};
const common = { owner: aliceIdentity.tokenIdentifier, version: 1 as const };
const image = { key: 'image', name: 'capture.png', mimeType: 'image/png', size: 3 };

test('failed speech extraction still checks video frames, while audio-only material stays unassessed', async () => {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const ids = await t.run(async (ctx) => {
    const original = { key: 'speech', name: 'speech.mp4', size: 3, mimeType: 'video/mp4' };
    const video = await ctx.db.insert('assets', {
      ...common,
      name: 'Video',
      kind: 'video',
      content: { original, poster: image, frames: [{ ...image, at: 0 }] },
    });
    const audio = await ctx.db.insert('assets', {
      ...common,
      name: 'Audio',
      kind: 'audio',
      content: { original: { ...original, mimeType: 'audio/mpeg' } },
    });
    for (const assetId of [video, audio])
      await ctx.db.insert('assetExtractions', {
        owner: common.owner,
        assetId,
        kind: 'transcript',
        status: 'failed',
        durationSeconds: 2,
        segments: [],
        error: 'Transcript unavailable',
        model: 'universal-3-5-pro',
        createdAt: Date.now(),
      });
    return { video, audio };
  });
  let decisions = 0;
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/decisions')) {
      decisions++;
      expect(init?.body).toContain('Spoken claims have not been fully checked');
      expect(init?.body).toContain('data:image/png;base64,');
      return Promise.resolve(answer());
    }
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  });
  vi.stubGlobal('fetch', fetch);
  const video = await alice.action(api.quickCheck.forAssets, { ...context, assetIds: [ids.video] });
  expect(video.status).toBe('succeeded');
  expect(video.notes[0]?.message).toContain('spoken claims were not checked');
  const audio = await alice.action(api.quickCheck.forAssets, { ...context, assetIds: [ids.audio] });
  expect(audio).toMatchObject({ status: 'unsupported', rules: [] });
  expect(decisions).toBe(1);
  const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
  expect(spans.filter((s) => s.operation === 'transcription')).toHaveLength(0);
  expect(
    fetch.mock.calls.some(([url]) => url.includes('assemblyai') || url.includes('transcriptions')),
  ).toBe(false);
  expect(spans.filter((s) => s.status === 'failed').every((s) => s.costUsd === null)).toBe(true);
});

test('quick checks use the primary transcript service for audio above 25 MB', async () => {
  vi.stubEnv('ASSEMBLYAI_API_KEY', 'test-assembly-key');
  try {
    const t = setup(),
      alice = t.withIdentity(aliceIdentity);
    const id = await t.run((ctx) =>
      ctx.db.insert('assets', {
        ...common,
        name: 'Audio',
        kind: 'audio',
        content: {
          original: { key: 'audio', name: 'ad.mp3', mimeType: 'audio/mpeg', size: 25_000_001 },
        },
      }),
    );
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('api.assemblyai.com'))
        return Promise.resolve(
          Response.json({
            id: 'job',
            status: 'completed',
            audio_duration: 1,
            words: [{ start: 0, end: 1000, text: 'Offer.' }],
          }),
        );
      expect(url).toMatch(/\/decisions$/);
      expect(init?.body).toContain('[0.00–1.00s] Offer.');
      return Promise.resolve(answer());
    });
    vi.stubGlobal('fetch', fetch);
    await t.mutation(internal.assetExtractionState.ensure, { assetIds: [id], owner: common.owner });
    await t.action(internal.assetExtraction.run, { assetId: id, kind: 'transcript' });
    const result = await alice.action(api.quickCheck.forAssets, { ...context, assetIds: [id] });
    expect(result.status, result.error).toBe('succeeded');
    expect(result.notes).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    vi.stubEnv('ASSEMBLYAI_API_KEY', undefined);
  }
});
