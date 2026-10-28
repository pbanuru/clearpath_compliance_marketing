import type { ReviewDetail, Version } from './model';

export function evidenceNotice(data: ReviewDetail, version: Version): string | undefined {
  if (['queued', 'running'].includes(version.analysis.status)) return;
  const missing = new Set<string>(),
    partial = new Set<string>();
  for (const asset of version.assets) {
    if (asset.kind !== 'audio' && asset.kind !== 'video') continue;
    const transcript = data.extractions.find(
      (e) => e.assetId === asset._id && e.kind === 'transcript',
    );
    if (transcript?.status !== 'succeeded') missing.add('the transcript');
    if (transcript?.segmentsTruncated) partial.add('transcript text');
    if (transcript?.wordsTruncated) partial.add('word timings');
    if (asset.kind === 'video') {
      const timeline = data.extractions.find(
        (e) => e.assetId === asset._id && e.kind === 'video_timeline',
      );
      if (timeline?.status !== 'succeeded') missing.add('the visual timeline');
      if (!asset.content.frames?.length) missing.add('video frames');
    }
  }
  if (version.analysis.frameToolCeilingHit) partial.add('video frames');
  // Keep the original analysis limitations visible even if a shared asset's
  // extraction recovered later. These notes describe the evidence actually read.
  for (const note of version.analysis.extractionNotes ?? []) {
    if (/word-level timings.*partial/i.test(note)) partial.add('word timings');
    else if (/transcript.*partial|remaining speech/i.test(note)) partial.add('transcript text');
    else if (/transcript:/i.test(note)) missing.add('the transcript');
    else if (/visual timeline/i.test(note)) missing.add('the visual timeline');
    else if (/frames.*unavailable/i.test(note)) missing.add('video frames');
    else if (/frames.*limited/i.test(note)) partial.add('video frames');
    else missing.add('some material');
  }
  const join = (items: Set<string>) => [...items].join(' and ');
  const parts = [];
  if (missing.size) parts.push(`Read without ${join(missing)}`);
  if (partial.size) parts.push(`Read with partial ${join(partial)}`);
  return parts.length
    ? `${parts.join('; ')}.`
    : version.analysis.status === 'failed'
      ? 'The AI first read did not finish. Review by hand.'
      : undefined;
}

export function needsApprovalConfirmation(open: number, notice?: string) {
  return open > 0 || Boolean(notice);
}
