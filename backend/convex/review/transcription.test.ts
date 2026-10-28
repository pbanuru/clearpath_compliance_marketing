import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { response, summary } from '../pipelineTest.helpers';
import { record } from './parsing';

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
async function queued(size = 10) {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const assetId = await t.run((ctx) =>
    ctx.db.insert('assets', {
      owner: aliceIdentity.tokenIdentifier,
      version: 1,
      name: 'Audio',
      kind: 'audio',
      content: { original: { key: 'recording', name: 'ad.mp3', mimeType: 'audio/mpeg', size } },
    }),
  );
  const reviewId = await alice.mutation(api.reviews.create, {
    title: 'Audio',
    product: 'personal_loan',
    channel: 'video_audio',
    jurisdictions: ['US'],
    assetIds: [assetId],
  });
  return { t, alice, assetId, reviewId };
}
const completed = {
  id: 'job-1',
  status: 'completed',
  speech_model_used: 'universal-3-5-pro',
  audio_duration: 10,
  words: [
    { start: 100, end: 500, text: 'Hello' },
    { start: 600, end: 1200, text: 'world.' },
  ],
};

test('AssemblyAI primary transcribes above 25 MB by signed URL, retains words, and accounts once', async () => {
  const { t, alice, reviewId, assetId } = await queued(25_000_001);
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url === 'https://api.assemblyai.com/v2/transcript') {
      if (typeof init?.body !== 'string') throw new Error('Expected JSON request');
      const body = record(JSON.parse(init.body));
      expect(body.audio_url).toMatch(/^https:\/\/(?:test\.)?r2.example.com\//);
      expect(body.speech_models).toEqual(['universal-3-5-pro']);
      return Promise.resolve(Response.json({ id: 'job-1', status: 'queued' }));
    }
    if (url.endsWith('/transcript/job-1')) return Promise.resolve(Response.json(completed));
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init?.body).toContain('[0.10–1.20s] Hello world.');
    return Promise.resolve(response(JSON.stringify({ summary, findings: [], previous: [] })));
  });
  vi.stubGlobal('fetch', fetch);
  await t.action(internal.review.analysis.run, { reviewId, version: 1 });
  const detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.versions[0]?.analysis.status, detail.versions[0]?.analysis.error).toBe('succeeded');
  expect(detail.transcripts[0]?.segments).toEqual([{ start: 0.1, end: 1.2, text: 'Hello world.' }]);
  const extraction = await t.run((ctx) => ctx.db.query('assetExtractions').first());
  expect(extraction).toMatchObject({
    assetId,
    model: 'universal-3-5-pro',
    words: [
      { start: 0.1, end: 0.5, text: 'Hello' },
      { start: 0.6, end: 1.2, text: 'world.' },
    ],
  });
  const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
  expect(spans).toHaveLength(2);
  expect(spans[0]).toMatchObject({
    provider: 'assemblyai',
    status: 'succeeded',
    requestId: 'job-1',
    usage: { audioSeconds: 10 },
    costBasis: 'rate_estimate',
  });
  expect(spans[0]?.costUsd).toBeCloseTo((10 / 3600) * 0.21);
});

test.each([false, true])(
  'primary failure falls back to OpenAI; both failures remain visible (%s)',
  async (bothFail) => {
    const { t, alice, reviewId } = await queued();
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        if (url.includes('assemblyai.com'))
          return Promise.resolve(Response.json({ error: 'Primary unavailable' }, { status: 401 }));
        if (url.endsWith('/audio/transcriptions'))
          return Promise.resolve(
            bothFail
              ? Response.json({ error: { message: 'Fallback unavailable' } }, { status: 401 })
              : Response.json({ duration: 10, segments: [{ start: 0, end: 1, text: 'Hello' }] }),
          );
        if (url.endsWith('/responses'))
          return Promise.resolve(response(JSON.stringify({ summary, findings: [], previous: [] })));
        return Promise.resolve(new Response(new Uint8Array([1])));
      }),
    );
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.versions[0]?.analysis.status).toBe(bothFail ? 'failed' : 'succeeded');
    const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
    expect(spans.map((s) => [s.provider, s.status])).toEqual(
      bothFail
        ? [
            ['assemblyai', 'failed'],
            ['openai', 'failed'],
          ]
        : [
            ['assemblyai', 'failed'],
            ['openai', 'succeeded'],
            ['openai', 'succeeded'],
          ],
    );
    expect(spans[0]?.costUsd).toBeNull();
    expect(detail.cost.unknownCalls).toBe(bothFail ? 2 : 1);
    if (bothFail) {
      expect(detail.versions[0]?.analysis.error).toContain('Primary unavailable');
      expect(detail.versions[0]?.analysis.error).toContain('Fallback unavailable');
    }
  },
);
