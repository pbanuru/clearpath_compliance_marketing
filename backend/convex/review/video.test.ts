import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { response, summary } from '../pipelineTest.helpers';
import { parseTimeline } from './gemini';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  for (const [name, value] of Object.entries({
    R2_BUCKET: 'test',
    R2_ENDPOINT: 'https://r2.example.com',
    R2_ACCESS_KEY_ID: 'test',
    R2_SECRET_ACCESS_KEY: 'test',
    OPENAI_API_KEY: 'stub',
    ASSEMBLYAI_API_KEY: 'stub',
    GEMINI_API_KEY: 'stub',
  }))
    vi.stubEnv(name, value);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const timeline = [
  {
    start: 1,
    end: 2.5,
    kind: 'on_screen_text',
    text: 'Terms apply',
    prominence: { size: 'small', contrast: 'low', position: 'bottom' },
    notes: 'Brief disclosure.',
  },
];
async function fixture() {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const assetId = await t.run((ctx) =>
    ctx.db.insert('assets', {
      owner: aliceIdentity.tokenIdentifier,
      name: 'Video',
      version: 1,
      kind: 'video',
      content: {
        original: { key: 'video', name: 'video.mp4', mimeType: 'video/mp4', size: 3 },
        poster: { key: 'poster', name: 'poster.jpg', mimeType: 'image/jpeg', size: 3 },
        frames: [{ key: 'frame', name: 'frame.jpg', mimeType: 'image/jpeg', size: 3, at: 1 }],
      },
    }),
  );
  return { t, alice, assetId };
}
function providerFetch(fail = false) {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.includes('assemblyai.com'))
      return Promise.resolve(
        Response.json({
          id: 'aai',
          status: 'completed',
          speech_model_used: 'universal-3-5-pro',
          audio_duration: 3,
          words: [{ start: 0, end: 1000, text: 'Hello.' }],
        }),
      );
    if (url.endsWith('/upload/v1beta/files'))
      return Promise.resolve(
        fail
          ? Response.json({ error: 'Video unavailable' }, { status: 500 })
          : Response.json(
              {},
              {
                headers: {
                  'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/session',
                },
              },
            ),
      );
    if (url.endsWith('/upload/session')) {
      expect(init?.body).toBeInstanceOf(ReadableStream);
      return Promise.resolve(
        Response.json({
          file: { name: 'files/test-video', state: 'PROCESSING', uri: 'https://provider/video' },
        }),
      );
    }
    if (url.endsWith('/files/test-video'))
      return Promise.resolve(
        init?.method === 'DELETE'
          ? Response.json({})
          : Response.json({
              name: 'files/test-video',
              state: 'ACTIVE',
              uri: 'https://provider/video',
            }),
      );
    if (url.includes(':generateContent'))
      return Promise.resolve(
        Response.json({
          candidates: [{ content: { parts: [{ text: JSON.stringify({ events: timeline }) }] } }],
          usageMetadata: {
            promptTokenCount: 1000,
            candidatesTokenCount: 100,
            thoughtsTokenCount: 50,
          },
        }),
      );
    if (url.endsWith('/responses')) {
      expect(init?.body).toContain('Word timings');
      if (!fail) expect(init?.body).toContain('Terms apply');
      else expect(init?.body).toContain('Video unavailable');
      return Promise.resolve(response(JSON.stringify({ summary, findings: [], previous: [] })));
    }
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  });
}

test.each([false, true])(
  'upload extracts layers once, reviewer reuses them and records a failed video fallback (%s)',
  async (fail) => {
    const { t, alice, assetId } = await fixture();
    const fetch = providerFetch(fail);
    vi.stubGlobal('fetch', fetch);
    const args = { assetIds: [assetId], owner: aliceIdentity.tokenIdentifier };
    await t.mutation(internal.assetExtractionState.ensure, args);
    await t.mutation(internal.assetExtractionState.ensure, args);
    expect(await t.query(internal.assetExtractionState.list, args)).toHaveLength(2);
    await Promise.all(
      (['transcript', 'video_timeline'] as const).map((kind) =>
        t.action(internal.assetExtraction.run, {
          assetId,
          kind,
        }),
      ),
    );
    const before = fetch.mock.calls.length;
    await t.action(internal.assetExtraction.run, { assetId, kind: 'transcript' });
    await t.action(internal.assetExtraction.run, { assetId, kind: 'video_timeline' });
    expect(fetch.mock.calls).toHaveLength(before);
    const rows = await t.query(internal.assetExtractionState.list, args);
    expect(rows.find((r) => r.kind === 'transcript')?.status).toBe('succeeded');
    const visual = rows.find((r) => r.kind === 'video_timeline');
    expect(visual?.status).toBe(fail ? 'failed' : 'succeeded');
    if (fail) expect(visual?.error).toContain('Video unavailable');
    else expect(visual?.timeline).toEqual(timeline);
    const reviewId = await alice.mutation(api.reviews.create, {
      title: 'Video',
      product: 'personal_loan',
      channel: 'video_audio',
      jurisdictions: ['US'],
      assetIds: [assetId],
    });
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.versions[0]?.analysis.status).toBe('succeeded');
    expect(detail.extractions).toHaveLength(2);
    expect(detail.versions[0]?.analysis.extractionNotes?.length).toBe(fail ? 1 : 0);
    const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
    expect(spans.filter((s) => s.provider === 'assemblyai')).toHaveLength(1);
    expect(spans.filter((s) => s.provider === 'gemini').length).toBe(fail ? 1 : 5);
    if (!fail)
      expect(spans.find((s) => s.operation === 'video_analysis')).toMatchObject({
        usage: { inputTokens: 1000, outputTokens: 150 },
        costUsd: 0.0038,
      });
    expect(await t.run((ctx) => ctx.db.query('aiUsageDaily').collect())).toHaveLength(fail ? 3 : 4);
  },
);

test('timeline parser rejects invalid timing and prominence', () => {
  expect(() => parseTimeline({ events: [{ ...timeline[0], start: 3, end: 1 }] })).toThrow();
  expect(() =>
    parseTimeline({ events: [{ ...timeline[0], prominence: { size: 'tiny' } }] }),
  ).toThrow();
});
