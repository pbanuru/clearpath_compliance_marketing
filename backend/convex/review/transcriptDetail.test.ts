import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../_generated/api';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { boundTranscript, MAX_TRANSCRIPT_SEGMENTS, MAX_TRANSCRIPT_WORDS } from './transcriptLimits';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test.each(['complete', 'count', 'bytes', 'words', 'legacy'] as const)(
  'detail retains transcript coverage metadata: %s',
  async (scenario) => {
    const source = {
      segments: Array.from(
        { length: scenario === 'count' ? MAX_TRANSCRIPT_SEGMENTS + 1 : 2 },
        (_, i) => ({
          start: i * 180,
          end: (i + 1) * 180,
          text: scenario === 'bytes' ? '界'.repeat(70000) : `Speech ${i}`,
        }),
      ),
      words:
        scenario === 'words'
          ? Array.from({ length: MAX_TRANSCRIPT_WORDS + 1 }, (_, i) => ({
              start: i,
              end: i + 1,
              text: 'word',
            }))
          : undefined,
      segmentsTruncated: scenario === 'legacy',
    };
    const bounded = boundTranscript(source);
    // Re-bounding cached data must preserve the original count, including when
    // an older truncated record has no known total.
    const saved = boundTranscript(bounded);
    const t = setup();
    const alice = t.withIdentity(aliceIdentity);
    const assetId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('assets', {
        owner: aliceIdentity.tokenIdentifier,
        version: 1,
        name: 'Recording',
        kind: 'audio',
        content: {
          original: { key: 'recording', name: 'audio.mp3', mimeType: 'audio/mpeg', size: 10 },
        },
      });
      await ctx.db.insert('assetExtractions', {
        owner: aliceIdentity.tokenIdentifier,
        assetId: id,
        kind: 'transcript',
        status: 'succeeded',
        model: 'test',
        createdAt: Date.now(),
        ...saved,
      });
      return id;
    });
    const reviewId = await alice.mutation(api.reviews.create, {
      title: 'Recording',
      product: 'personal_loan',
      channel: 'video_audio',
      jurisdictions: ['US'],
      assetIds: [assetId],
    });
    const detail = await alice.query(api.reviews.get, { reviewId });
    expect(detail.transcripts).toHaveLength(1);
    const transcript = detail.transcripts[0];
    expect(transcript?.segmentsTruncated).toBe(['count', 'bytes', 'legacy'].includes(scenario));
    expect(transcript?.wordsTruncated).toBe(scenario === 'words');
    expect(transcript?.segments).toEqual(saved.segments);
    expect(transcript?.retainedThroughSeconds).toBe(saved.segments.at(-1)?.end ?? 0);
    expect(transcript?.totalSegments).toBe(
      scenario === 'legacy' ? undefined : source.segments.length,
    );
    if (scenario === 'count' || scenario === 'bytes')
      expect(transcript?.segments.length).toBeLessThan(source.segments.length);
  },
);
