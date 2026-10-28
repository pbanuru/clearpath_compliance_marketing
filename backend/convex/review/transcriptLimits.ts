type Segment = { start: number; end: number; text: string };
export const MAX_TRANSCRIPT_WORDS = 2048;
export const MAX_TRANSCRIPT_SEGMENTS = 2048;
const encoder = new TextEncoder();

function prefix(items: Segment[], count: number, byteLimit: number) {
  const kept: Segment[] = [];
  let bytes = 2;
  for (const item of items) {
    const size = encoder.encode(JSON.stringify(item)).byteLength + 1;
    if (kept.length >= count || bytes + size > byteLimit) break;
    kept.push(item);
    bytes += size;
  }
  return kept;
}

// Bound both array cardinality and serialized UTF-8 bytes before crossing a
// Convex function boundary. Leave room below the 1 MiB document limit for metadata.
export function boundTranscript(input: {
  segments: Segment[];
  words?: Segment[];
  wordsTruncated?: boolean;
  segmentsTruncated?: boolean;
}) {
  const segments = prefix(input.segments, MAX_TRANSCRIPT_SEGMENTS, 384 * 1024);
  const words = input.words ? prefix(input.words, MAX_TRANSCRIPT_WORDS, 96 * 1024) : undefined;
  return {
    segments,
    words,
    wordsTruncated: !!input.wordsTruncated || (words?.length ?? 0) < (input.words?.length ?? 0),
    segmentsTruncated: !!input.segmentsTruncated || segments.length < input.segments.length,
  };
}

export function transcriptLimitNote(input: ReturnType<typeof boundTranscript>) {
  if (input.segmentsTruncated)
    return 'Transcript text and timings are partial because the stored transcript limit was reached. Remaining speech has not been checked; listen to the original.';
  if (input.wordsTruncated)
    return 'Word-level timings are partial because the stored word limit was reached. The retained segment transcript still supplies the speech text; use the original for finer timing.';
  return null;
}
