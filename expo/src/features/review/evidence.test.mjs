import { expect, test } from 'vitest';
import { evidenceNotice, needsApprovalConfirmation } from './evidence';

function fixture() {
  const version = {
    analysis: { status: 'succeeded' },
    assets: [{ _id: 'video', kind: 'video', content: { frames: [{ at: 0 }] } }],
  };
  const data = {
    extractions: ['transcript', 'video_timeline'].map((kind) => ({
      assetId: 'video',
      kind,
      status: 'succeeded',
    })),
  };
  return { data, version };
}
test('complete evidence can approve directly only after all findings are reviewed', () => {
  const { data, version } = fixture();
  expect(evidenceNotice(data, version)).toBeUndefined();
  expect(needsApprovalConfirmation(0, evidenceNotice(data, version))).toBe(false);
  expect(needsApprovalConfirmation(1, evidenceNotice(data, version))).toBe(true);
});
test.each(['transcript', 'video_timeline'])(
  'a failed %s remains visible and requires confirmation with zero findings',
  (kind) => {
    const { data, version } = fixture();
    data.extractions.find((e) => e.kind === kind).status = 'failed';
    const notice = evidenceNotice(data, version);
    expect(notice).toContain(kind === 'transcript' ? 'transcript' : 'timeline');
    expect(needsApprovalConfirmation(0, notice)).toBe(true);
  },
);
test.each(['segmentsTruncated', 'wordsTruncated'])(
  'partial transcript coverage is visible and requires confirmation (%s)',
  (field) => {
    const { data, version } = fixture();
    data.extractions[0][field] = true;
    const notice = evidenceNotice(data, version);
    expect(notice).toBeTruthy();
    expect(needsApprovalConfirmation(0, notice)).toBe(true);
  },
);
test('missing frames and the inspection ceiling are visible, including after all findings are triaged', () => {
  const { data, version } = fixture();
  version.assets[0].content.frames = [];
  expect(evidenceNotice(data, version)).toContain('frames');
  version.assets[0].content.frames = [{ at: 0 }];
  version.analysis.frameToolCeilingHit = true;
  expect(needsApprovalConfirmation(0, evidenceNotice(data, version))).toBe(true);
});
test('recovered shared extractions do not erase limitations of the original analysis', () => {
  const { data, version } = fixture();
  version.analysis.extractionNotes = ['Asset video visual timeline: unavailable'];
  expect(evidenceNotice(data, version)).toContain('timeline');
  expect(needsApprovalConfirmation(0, evidenceNotice(data, version))).toBe(true);
});
