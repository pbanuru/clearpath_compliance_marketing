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

test('reusing an older transcript refreshes it through the authoritative speech provider', async () => {
  const { t, alice, assetId, reviewId } = await queued();
  await t.run((ctx) =>
    ctx.db.insert('assetExtractions', {
      owner: aliceIdentity.tokenIdentifier,
      assetId,
      kind: 'transcript',
      status: 'succeeded',
      segments: [{ start: 0, end: 1, text: 'Old transcript' }],
      durationSeconds: 10,
      model: 'old-provider',
      createdAt: Date.now(),
    }),
  );
  const fetch = vi.fn((url: string) => {
    if (url.includes('assemblyai.com')) return Promise.resolve(Response.json(completed));
    expect(url).toBe('https://api.openai.com/v1/responses');
    return Promise.resolve(response(JSON.stringify({ summary, findings: [], previous: [] })));
  });
  vi.stubGlobal('fetch', fetch);
  await t.mutation(internal.assetExtractionState.ensure, {
    assetIds: [assetId],
    owner: aliceIdentity.tokenIdentifier,
  });
  await t.action(internal.assetExtraction.run, { assetId, kind: 'transcript' });
  await t.action(internal.review.analysis.run, { reviewId, version: 1 });
  const detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.extractions[0]?.model).toBe('universal-3-5-pro');
  expect(detail.transcripts[0]?.segments[0]?.text).toBe('Hello world.');
  expect(fetch.mock.calls.filter(([url]) => url.includes('assemblyai.com'))).toHaveLength(1);
});

test('AssemblyAI transcribes original media by signed URL, retains words, and accounts once', async () => {
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
  const row = (await alice.query(api.reviews.get, { reviewId })).versions[0]?.assets[0];
  if (!row) throw new Error('Missing asset');
  await t.mutation(internal.assetExtractionState.ensure, {
    assetIds: [row._id],
    owner: aliceIdentity.tokenIdentifier,
  });
  await t.action(internal.assetExtraction.run, { assetId: row._id, kind: 'transcript' });
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

test.each(['missing_key', 'provider_failure'])(
  'AssemblyAI failure is visible and explicit retry recovers without another transcript provider (%s)',
  async (failure) => {
    const { t, alice, reviewId, assetId } = await queued();
    if (failure === 'missing_key') vi.stubEnv('ASSEMBLYAI_API_KEY', '');
    let recovered = false;
    const fetch = vi.fn((url: string) => {
      if (url.includes('assemblyai.com'))
        return Promise.resolve(
          recovered
            ? Response.json(completed)
            : Response.json({ error: 'Transcript unavailable' }, { status: 401 }),
        );
      expect(url).toBe('https://api.openai.com/v1/responses');
      return Promise.resolve(response(JSON.stringify({ summary, findings: [], previous: [] })));
    });
    vi.stubGlobal('fetch', fetch);
    await t.mutation(internal.assetExtractionState.ensure, {
      assetIds: [assetId],
      owner: aliceIdentity.tokenIdentifier,
    });
    await t.action(internal.assetExtraction.run, { assetId, kind: 'transcript' });
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.extractions[0]?.status).toBe('failed');
    expect(detail.extractions[0]?.error).toContain(
      failure === 'missing_key' ? 'ASSEMBLYAI_API_KEY' : 'Transcript unavailable',
    );
    expect(detail.versions[0]?.analysis.extractionNotes?.join(' ')).toContain('transcript');
    expect(detail.versions[0]?.analysis.status).toBe('succeeded');
    const attempted = await t.run((ctx) => ctx.db.query('aiSpans').collect());
    expect(
      attempted
        .filter((s) => s.operation === 'transcription')
        .every((s) => s.provider === 'assemblyai'),
    ).toBe(true);
    recovered = true;
    vi.stubEnv('ASSEMBLYAI_API_KEY', 'restored');
    await alice.mutation(api.reviews.retryAnalysis, { reviewId });
    await t.action(internal.assetExtraction.run, { assetId, kind: 'transcript' });
    await t.action(internal.review.analysis.run, { reviewId, version: 1 });
    const retried = await alice.query(api.reviews.get, { reviewId });
    expect(retried.extractions[0]?.status).toBe('succeeded');
    expect(retried.versions[0]?.analysis.extractionNotes).toEqual([]);
  },
);

test('a transcript beyond Convex array limits persists safely and anchors quotes beyond retained word timings', async () => {
  const { t, alice, reviewId, assetId } = await queued(100_000_000);
  const words = Array.from({ length: 15000 }, (_, i) => ({
    start: i * 100,
    end: i * 100 + 80,
    text: `offer${i}`,
  }));
  const quote = 'offer12000 offer12001';
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('assemblyai.com'))
        return Promise.resolve(Response.json({ ...completed, audio_duration: 1500, words }));
      expect(url).toBe('https://api.openai.com/v1/responses');
      expect(init?.body).toContain('Word-level timings are partial');
      expect(init?.body).toContain(quote);
      return Promise.resolve(
        response(
          JSON.stringify({
            summary,
            findings: [
              {
                severity: 'required',
                policyId: 'approval-claims',
                title: 'Review this offer',
                explanation: 'Test quoted text.',
                suggestedFix: 'Qualify it.',
                confidence: 'high',
                location: {
                  assetId,
                  quote,
                  startSeconds: null,
                  endSeconds: null,
                  page: null,
                  region: null,
                },
              },
            ],
            previous: [],
          }),
        ),
      );
    }),
  );
  await t.mutation(internal.assetExtractionState.ensure, {
    assetIds: [assetId],
    owner: aliceIdentity.tokenIdentifier,
  });
  await t.action(internal.assetExtraction.run, { assetId, kind: 'transcript' });
  await t.action(internal.review.analysis.run, { reviewId, version: 1 });
  const detail = await alice.query(api.reviews.get, { reviewId });
  expect(detail.review.status).toBe('in_review');
  expect(detail.versions[0]?.analysis.status).toBe('succeeded');
  expect(detail.findings[0]?.quoteFound).toBe(true);
  const stored = await t.run((ctx) => ctx.db.query('assetExtractions').first());
  expect(stored?.words?.length).toBeLessThanOrEqual(2048);
  expect(stored?.wordsTruncated).toBe(true);
  expect(stored?.segmentsTruncated).toBe(false);
  expect(stored?.segments.map((s) => s.text).join('\n')).toContain(quote);
  expect(new TextEncoder().encode(JSON.stringify(stored)).byteLength).toBeLessThan(512 * 1024);
});
