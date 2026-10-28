import { afterEach, expect, test, vi } from 'vitest';
import { setup, aliceIdentity } from '../reviewTest.helpers';
import { response, summary } from '../pipelineTest.helpers';
import { nearestFrame } from './frameTools';
import { reviewWithFrames } from './respond';
import type { MediaContext } from './mediaInput';
import { record } from './parsing';

vi.mock('../assetStorage', () => ({
  storage: { getUrl: () => Promise.resolve('https://frames.example/frame.jpg') },
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
test('nearest stored frame selection uses actual time with deterministic ties', () => {
  const frames = [{ at: 1 }, { at: 3 }, { at: 8 }];
  expect(nearestFrame(frames, 2.9)?.at).toBe(3);
  expect(nearestFrame(frames, 2)?.at).toBe(1);
  expect(nearestFrame(frames, 99)?.at).toBe(8);
  expect(nearestFrame<{ at: number }>([], 0)).toBeUndefined();
});

test.each(['roundtrip', 'rounds', 'frames'] as const)(
  'reviewer tool round trip and %s ceiling',
  async (mode) => {
    for (const [name, value] of Object.entries({
      R2_BUCKET: 'test',
      R2_ENDPOINT: 'https://r2.example.com',
      R2_ACCESS_KEY_ID: 'test',
      R2_SECRET_ACCESS_KEY: 'test',
    }))
      vi.stubEnv(name, value);
    const t = setup();
    const asset = await t.run(async (ctx) => {
      const frame = { key: 'f', name: 'f.jpg', mimeType: 'image/jpeg', size: 3 };
      const id = await ctx.db.insert('assets', {
        owner: aliceIdentity.tokenIdentifier,
        name: 'Video',
        version: 1,
        kind: 'video',
        content: {
          original: { ...frame, mimeType: 'video/mp4' },
          poster: frame,
          frames: [
            { ...frame, at: 1 },
            { ...frame, at: 3 },
          ],
        },
      });
      return ctx.db.get('assets', id);
    });
    if (!asset) throw new Error('Missing video');
    const context: MediaContext = {
      owner: aliceIdentity.tokenIdentifier,
      key: 'stub',
      cached: [],
      extractions: [],
      spans: [],
      texts: new Map(),
      bytes: 0,
    };
    const usage = { frameToolRounds: 0, frameToolFrames: 0, frameToolCeilingHit: false };
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (!url.endsWith('/responses'))
          return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
        calls++;
        if (typeof init?.body !== 'string') throw new Error('Expected JSON');
        const body = record(JSON.parse(init.body));
        if (calls > 1) {
          expect(init.body).toContain('function_call_output');
          expect(init.body).toContain('actual video frame at 3.00 seconds');
          expect(init.body).toContain('data:image/jpeg;base64,');
        }
        const finished = mode === 'roundtrip' ? calls > 1 : body.tool_choice === 'none';
        if (finished)
          return Promise.resolve(response(JSON.stringify({ summary, findings: [], previous: [] })));
        const times = mode === 'frames' ? Array.from({ length: 60 }, () => 2.9) : [2.9];
        return Promise.resolve(
          Response.json({
            status: 'completed',
            usage: { input_tokens: 100, output_tokens: 10 },
            output: [
              { type: 'reasoning', encrypted_content: 'encrypted' },
              {
                type: 'function_call',
                name: 'get_video_frames',
                call_id: `call-${calls}`,
                arguments: JSON.stringify({ assetId: asset._id, times }),
              },
            ],
          }),
        );
      }),
    );
    expect(
      (
        await reviewWithFrames({
          context,
          content: [],
          instructions: 'Review',
          assets: [asset],
          previous: [],
          usage,
        })
      ).summary,
    ).toBe(summary);
    expect(context.spans).toHaveLength(calls);
    expect(usage.frameToolCeilingHit).toBe(mode !== 'roundtrip');
    expect(usage.frameToolRounds).toBe(mode === 'rounds' ? 10 : 1);
    expect(usage.frameToolFrames).toBe(mode === 'frames' ? 48 : mode === 'rounds' ? 10 : 1);
  },
);
