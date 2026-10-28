import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { output, response, summary } from '../pipelineTest.helpers';
import { record } from './parsing';

vi.stubEnv('R2_BUCKET', 'test-assets');
vi.stubEnv('R2_ENDPOINT', 'https://example.r2.cloudflarestorage.com');
vi.stubEnv('R2_ACCESS_KEY_ID', 'test-id');
vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
vi.stubEnv('OPENAI_API_KEY', 'stub-key');
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('video frames, PDFs, images, and timestamped transcripts are inline; resubmission reuses the transcript', async () => {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const ids = await t.run(async (ctx) => {
    const common = { owner: aliceIdentity.tokenIdentifier, version: 1 as const };
    const file = { key: 'original', name: 'ad.mp4', size: 10, mimeType: 'video/mp4' };
    const frame = { key: 'frame', name: 'frame.jpg', size: 3, mimeType: 'image/jpeg' };
    const video = await ctx.db.insert('assets', {
      ...common,
      name: 'Video',
      kind: 'video',
      content: {
        original: file,
        poster: frame,
        frames: [
          { ...frame, at: 0 },
          { ...frame, key: 'frame-last', at: 9 },
        ],
      },
    });
    const image = await ctx.db.insert('assets', {
      ...common,
      name: 'Image',
      kind: 'image',
      content: { original: frame },
    });
    const pdf = await ctx.db.insert('assets', {
      ...common,
      name: 'PDF',
      kind: 'document',
      content: {
        original: { ...file, key: 'pdf', name: 'ad.pdf', mimeType: 'application/pdf' },
        parts: [],
      },
    });
    return { video, image, pdf };
  });
  const reviewId = await alice.mutation(api.reviews.create, {
    title: 'Bundle',
    product: 'personal_loan',
    channel: 'email',
    jurisdictions: ['US'],
    assetIds: Object.values(ids),
  });
  let transcriptions = 0,
    reviews = 0;
  const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/audio/transcriptions')) {
      transcriptions++;
      if (!(init?.body instanceof FormData)) throw new Error('Expected multipart audio');
      expect(init.body.get('model')).toBe('whisper-1');
      expect(init.body.get('timestamp_granularities[]')).toBe('segment');
      return Promise.resolve(
        Response.json({
          duration: 10,
          segments: [{ start: 0, end: 2, text: 'Guaranteed approval' }],
        }),
      );
    }
    if (url.endsWith('/responses')) {
      reviews++;
      if (typeof init?.body !== 'string') throw new Error('Expected a JSON request');
      const body: unknown = JSON.parse(init.body);
      expect(body).toMatchObject({
        model: 'gpt-6.1-sol',
        reasoning: { effort: 'high' },
        text: { format: { type: 'json_schema', strict: true } },
      });
      expect(init.body).toContain('data:image/jpeg;base64,');
      expect(init.body).toContain('data:application/pdf;base64,');
      expect(init.body).toContain('video frame at 9.00 seconds');
      expect(init.body).toContain('[0.00–2.00s] Guaranteed approval');
      expect(record(body).instructions).toContain('email-can-spam');
      expect(record(body).instructions).not.toContain('card-promo-rate');
      return Promise.resolve(
        response(
          JSON.stringify(
            reviews === 1
              ? output(ids.video)
              : {
                  summary,
                  findings: [],
                  previous: [{ findingId: recheck.findingId, status: 'resolved', note: 'Fixed.' }],
                },
          ),
        ),
      );
    }
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  });
  vi.stubGlobal('fetch', fetch);
  const recheck = { findingId: '' };
  await t.mutation(internal.assetExtractionState.ensure, {
    assetIds: [ids.video],
    owner: aliceIdentity.tokenIdentifier,
  });
  await t.action(internal.assetExtraction.run, { assetId: ids.video, kind: 'transcript' });
  await t.action(internal.assetExtraction.run, { assetId: ids.video, kind: 'video_timeline' });
  await t.action(internal.review.analysis.run, { reviewId, version: 1 });
  const detail = await alice.query(api.reviews.get, { reviewId });
  const finding = detail.findings[0];
  if (!finding) throw new Error('Expected finding');
  recheck.findingId = finding._id;
  expect(finding.quoteFound).toBe(true);
  expect(detail.transcripts).toEqual([
    {
      assetId: ids.video,
      status: 'succeeded',
      segments: [{ start: 0, end: 2, text: 'Guaranteed approval' }],
    },
  ]);
  await alice.mutation(api.findings.setStatus, { findingId: finding._id, status: 'accepted' });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'changes_requested' });
  await alice.mutation(api.reviews.resubmit, {
    reviewId,
    assetIds: Object.values(ids),
    responses: [{ findingId: finding._id, text: 'Fixed.' }],
  });
  await t.action(internal.review.analysis.run, { reviewId, version: 2 });
  expect(transcriptions).toBe(1);
  expect(reviews).toBe(2);
  const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
  expect(spans).toHaveLength(3);
  expect(spans.find((s) => s.operation === 'transcription')).toMatchObject({
    costUsd: 0.001,
    usage: { audioSeconds: 10 },
  });
  expect((await alice.query(api.reviews.get, { reviewId })).versions[1]?.analysis.status).toBe(
    'succeeded',
  );
});

test('detail hides extraction rows owned by another workspace', async () => {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const assetId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('assets', {
      owner: aliceIdentity.tokenIdentifier,
      name: 'Audio',
      version: 1,
      kind: 'audio',
      content: { original: { key: 'audio', name: 'audio.mp3', mimeType: 'audio/mpeg', size: 10 } },
    });
    await ctx.db.insert('assetExtractions', {
      owner: 'another-workspace',
      assetId: id,
      kind: 'transcript',
      status: 'succeeded',
      segments: [{ start: 0, end: 1, text: 'Private transcript' }],
      model: 'whisper-1',
      createdAt: Date.now(),
    });
    return id;
  });
  const reviewId = await alice.mutation(api.reviews.create, {
    title: 'Audio',
    product: 'personal_loan',
    channel: 'social',
    jurisdictions: ['US'],
    assetIds: [assetId],
  });
  expect((await alice.query(api.reviews.get, { reviewId })).transcripts).toEqual([]);
});
