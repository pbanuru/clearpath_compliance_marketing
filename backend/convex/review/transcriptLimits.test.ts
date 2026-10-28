import { expect, test } from 'vitest';
import { boundTranscript, transcriptLimitNote } from './transcriptLimits';

test('transcript bounds count serialized UTF-8 bytes, not only word count', () => {
  const text = '界'.repeat(100000);
  const result = boundTranscript({
    segments: [
      { start: 0, end: 1, text },
      { start: 1, end: 2, text },
    ],
    words: [{ start: 0, end: 1, text }],
  });
  expect(result.segments).toHaveLength(1);
  expect(result.words).toHaveLength(0);
  expect(result.wordsTruncated).toBe(true);
  expect(result.segmentsTruncated).toBe(true);
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(512 * 1024);
  expect(transcriptLimitNote(result)).toContain('Remaining speech has not been checked');
});
