import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { applicablePolicies } from './policies';

vi.stubEnv('R2_BUCKET', 'test-assets');
vi.stubEnv('R2_ENDPOINT', 'https://example.r2.cloudflarestorage.com');
vi.stubEnv('R2_ACCESS_KEY_ID', 'test-id');
vi.stubEnv('R2_SECRET_ACCESS_KEY', 'test-secret');
vi.stubEnv('OPENAI_API_KEY', 'test-key');
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function answer() {
  return Response.json({
    model: 'gpt-6-luna',
    answers: applicablePolicies('personal_loan', 'social').map((rule, i) =>
      i === 0
        ? { name: rule.id, type: 'refusal' }
        : { name: rule.id, type: 'predicate', probability: 0.2 },
    ),
    usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0 },
  });
}
const context = {
  product: 'personal_loan' as const,
  channel: 'social' as const,
  jurisdictions: ['US'],
};
const common = { owner: aliceIdentity.tokenIdentifier, version: 1 as const };
const image = { key: 'image', name: 'capture.png', mimeType: 'image/png', size: 3 };
const pdf = { key: 'pdf', name: 'material.pdf', mimeType: 'application/pdf', size: 3 };

test('PDF-only bundle records unsupported without a provider call or invented probabilities', async () => {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const assetId = await t.run((ctx) =>
    ctx.db.insert('assets', {
      ...common,
      name: 'PDF',
      kind: 'document',
      content: { original: pdf, parts: [] },
    }),
  );
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const result = await alice.action(api.quickCheck.forAssets, { ...context, assetIds: [assetId] });
  expect(result).toMatchObject({
    status: 'unsupported',
    rules: [],
    notes: [{ assetId, status: 'unsupported' }],
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(await t.run((ctx) => ctx.db.query('aiSpans').collect())).toEqual([]);
});
test('images, sampled frames, timestamped speech, captured text blocks and screenshots reach Decisions; PDFs never do', async () => {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const ids = await t.run(async (ctx) => {
    const text = await ctx.db.insert('assets', {
      ...common,
      name: 'Captured text',
      kind: 'text',
      content: { text: 'Captured offer text.' },
    });
    const webpage = await ctx.db.insert('assets', {
      ...common,
      name: 'Webpage',
      kind: 'webpage',
      content: { capture: image, sourceUrl: 'https://example.com/ad', parts: [text] },
    });
    const video = await ctx.db.insert('assets', {
      ...common,
      name: 'Video',
      kind: 'video',
      content: {
        original: { key: 'video', name: 'ad.mp4', size: 3, mimeType: 'video/mp4' },
        poster: image,
        frames: [{ ...image, at: 1.5 }],
      },
    });
    const document = await ctx.db.insert('assets', {
      ...common,
      name: 'PDF',
      kind: 'document',
      content: { original: pdf, parts: [] },
    });
    return [webpage, video, document];
  });
  const operations: string[] = [];
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/audio/transcriptions')) {
      operations.push('transcription');
      return Promise.resolve(
        Response.json({
          duration: 2,
          segments: [{ start: 0, end: 2, text: 'Spoken loan claim.' }],
        }),
      );
    }
    if (url.endsWith('/decisions')) {
      operations.push('quick_check');
      expect(init?.body).toContain('"type":"input_json"');
      expect(init?.body).toContain('"role":"user"');
      expect(init?.body).toContain('Captured offer text.');
      expect(init?.body).toContain('data:image/png;base64,');
      expect(init?.body).toContain('video frame at 1.50 seconds');
      expect(init?.body).toContain('[0.00–2.00s] Spoken loan claim.');
      expect(init?.body).not.toContain('input_file');
      expect(init?.body).not.toContain('data:application/pdf');
      return Promise.resolve(answer());
    }
    return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
  });
  vi.stubGlobal('fetch', fetch);
  const result = await alice.action(api.quickCheck.forAssets, { ...context, assetIds: ids });
  expect(result.status).toBe('succeeded');
  expect(result.rules[0]).toMatchObject({ refusal: true, probability: null, band: null });
  expect(result.notes).toHaveLength(1);
  expect(operations).toEqual(['transcription', 'quick_check']);
  const extraction = await t.run((ctx) => ctx.db.query('assetExtractions').first());
  expect(extraction).toMatchObject({ status: 'succeeded', owner: aliceIdentity.tokenIdentifier });
  const callCount = fetch.mock.calls.length;
  await alice.action(api.quickCheck.forAssets, { ...context, assetIds: ids });
  expect(fetch).toHaveBeenCalledTimes(callCount);
});
test('a webpage cannot smuggle a text block from another owner into model input', async () => {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const assetId = await t.run(async (ctx) => {
    const text = await ctx.db.insert('assets', {
      ...common,
      owner: 'other',
      name: 'Private',
      kind: 'text',
      content: { text: 'secret' },
    });
    return ctx.db.insert('assets', {
      ...common,
      name: 'Page',
      kind: 'webpage',
      content: { sourceUrl: 'https://example.com', capture: image, parts: [text] },
    });
  });
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(
    alice.action(api.quickCheck.forAssets, { ...context, assetIds: [assetId] }),
  ).rejects.toThrow('Asset not found');
  expect(fetch).not.toHaveBeenCalled();
});
test('simultaneous requests share an in-flight check and a single provider call', async () => {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const id = await alice.mutation(api.assets.createText, { name: 'Ad', text: 'A loan offer.' });
  let started: () => void = () => {
    throw new Error('Start gate not initialized');
  };
  let finish: (response: Response) => void = () => {
    throw new Error('Finish gate not initialized');
  };
  const gate = new Promise<void>((resolve) => {
    started = resolve;
  });
  const result = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const fetch = vi.fn(() => {
    started();
    return result;
  });
  vi.stubGlobal('fetch', fetch);
  const args = { ...context, assetIds: [id] };
  const first = alice.action(api.quickCheck.forAssets, args);
  await gate;
  const second = await alice.action(api.quickCheck.forAssets, args);
  expect(second.status).toBe('running');
  finish(answer());
  const completed = await first;
  expect(completed._id).toBe(second._id);
  expect(completed.status).toBe('succeeded');
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await alice.query(api.quickCheck.get, { id: second._id })).toMatchObject({
    status: 'succeeded',
  });
});

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
    return { video, audio };
  });
  let decisions = 0;
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    if (url.endsWith('/audio/transcriptions'))
      return Promise.resolve(
        Response.json({ error: { message: 'Missing audio scope' } }, { status: 401 }),
      );
    if (url.endsWith('/decisions')) {
      decisions++;
      expect(init?.body).toContain('Spoken claims have not been checked');
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
  expect(spans.filter((s) => s.operation === 'transcription')).toHaveLength(2);
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
    const result = await alice.action(api.quickCheck.forAssets, { ...context, assetIds: [id] });
    expect(result).toMatchObject({ status: 'succeeded', notes: [] });
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    vi.stubEnv('ASSEMBLYAI_API_KEY', undefined);
  }
});
