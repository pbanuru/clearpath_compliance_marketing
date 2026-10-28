import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iou, match, score, aggregate } from '../lib/score.mjs';

const assets = { image: 'a', text: 't', video: 'v', pdf: 'p' };
const box = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };
const issue = {
  id: 'approval',
  policyIds: ['approval-claims'],
  severity: 'required',
  anchors: [{ asset: 'text', quote: 'Guaranteed approval' }],
};
const finding = {
  _id: 'f',
  policyId: 'approval-claims',
  severity: 'required',
  title: 'Claim',
  explanation: 'Explanation',
  suggestedFix: 'Fix',
  location: { assetId: 't', quote: 'GUARANTEED APPROVAL for everyone' },
  quoteFound: true,
};
const scored = (issues, findings, clean = false) => score({ issues }, { findings }, assets, clean);

test('quotes match case-insensitive substrings in either direction, with the right policy and asset', () => {
  assert.ok(match(issue, finding, assets));
  assert.ok(match(issue, { ...finding, location: { assetId: 't', quote: 'Approval' } }, assets));
  assert.equal(match(issue, { ...finding, policyId: 'other' }, assets), null);
  assert.equal(
    match(issue, { ...finding, location: { assetId: 'a', quote: 'Guaranteed approval' } }, assets),
    null,
  );
  assert.equal(match(issue, { ...finding, location: { assetId: 't', quote: '' } }, assets), null);
});
test('time overlap catches numeric transcript variants and point timestamps', () => {
  const timed = {
    ...issue,
    anchors: [{ asset: 'video', quote: 'six percent', time: { start: 13.31, end: 15.18 } }],
  };
  const at = (startSeconds, endSeconds) => ({
    ...finding,
    location: { assetId: 'v', startSeconds, endSeconds, quote: '6%' },
  });
  assert.ok(match(timed, at(14, 16), assets));
  assert.ok(match(timed, at(14), assets));
  assert.equal(match(timed, at(12, 13), assets), null);
});
test('visual threshold and page scope; quotes remain an independent match', () => {
  const visual = {
    ...issue,
    anchors: [{ asset: 'pdf', region: box, page: 1, quote: 'Guaranteed approval' }],
  };
  assert.equal(iou(box, box), 1);
  assert.equal(iou(box, { ...box, x: 0.8 }), 0);
  assert.ok(
    match(visual, { ...finding, location: { assetId: 'p', region: box, page: 1 } }, assets),
  );
  assert.equal(
    match(visual, { ...finding, location: { assetId: 'p', region: box, page: 2 } }, assets),
    null,
  );
  assert.ok(
    match(visual, { ...finding, location: { assetId: 'p', quote: 'Guaranteed approval' } }, assets),
  );
  const square = { x: 0, y: 0, width: 1, height: 1 };
  const threshold = { ...issue, anchors: [{ asset: 'image', region: square }] };
  assert.ok(
    match(
      threshold,
      { ...finding, location: { assetId: 'a', region: { ...square, width: 0.1 } } },
      assets,
    ),
  );
  assert.equal(
    match(
      threshold,
      { ...finding, location: { assetId: 'a', region: { ...square, width: 0.099 } } },
      assets,
    ),
    null,
  );
});
test('missing disclosures may have no location and grouped or split findings are not extras', () => {
  const absence = { ...issue, anchors: [] };
  const result = scored([absence], [finding, { ...finding, _id: 'f2', location: undefined }]);
  assert.equal(result.requiredCaught, 1);
  assert.equal(result.extras.length, 0);
  assert.equal(result.issues[0].matches.length, 2);
});
test('one finding can cover multiple planted issues, retaining severity disagreement and adjacency', () => {
  const recommended = {
    ...issue,
    id: 'second',
    severity: 'recommended',
    adjacentSeverities: ['required'],
  };
  const result = scored([issue, recommended], [finding]);
  assert.equal(result.requiredRecall, 1);
  assert.equal(result.severityAgreement, 0.5);
  assert.equal(result.adjacentAgreements, 1);
  assert.equal(result.confusion.recommended.required, 1);
});
test('downgraded required findings count as caught but not required-at-required', () => {
  const result = scored([issue], [{ ...finding, severity: 'needs_context' }]);
  assert.equal(result.requiredRecall, 1);
  assert.equal(result.requiredAtRequired, 0);
  assert.equal(result.severityAgreement, 0);
});
test('accepted severity alternatives count as exact agreement', () => {
  const key = {
    ...issue,
    severity: 'recommended',
    acceptedSeverities: ['required', 'recommended'],
  };
  assert.equal(scored([key], [finding]).severityAgreement, 1);
});
test('optional issues never become misses; clean required findings remain false positives', () => {
  const optional = { ...issue, optional: true };
  const result = scored([optional], [finding], true);
  assert.equal(result.requiredTotal, 0);
  assert.equal(result.requiredRecall, null);
  assert.equal(result.requiredFalsePositives.length, 1);
  assert.equal(result.extras.length, 0);
  assert.equal(scored([optional], []).severityCompared, 0);
});
test('unmatched findings are preserved in full and missed required issues enter confusion', () => {
  const other = { ...finding, policyId: 'other', quoteFound: false };
  const result = scored([issue], [other]);
  assert.deepEqual(result.extras, [other]);
  assert.equal(result.confusion.required.missed, 1);
  assert.deepEqual(result.quoteFound, { found: 0, total: 1 });
});
test('typicality requires actual coverage, not just an endorsements policy id', () => {
  const key = { ...issue, policyIds: ['endorsements'], covers: 'typicality' };
  assert.equal(match(key, { ...finding, policyId: 'endorsements' }, assets), null);
  assert.ok(
    match(
      key,
      { ...finding, policyId: 'endorsements', explanation: 'These results are not typical.' },
      assets,
    ),
  );
});
test('visual quote matches without boxes count zero; text alternatives are excluded from visual IoU', () => {
  const visual = {
    ...issue,
    anchors: [{ asset: 'image', region: box, quote: 'Guaranteed approval' }, ...issue.anchors],
  };
  assert.equal(
    scored([visual], [{ ...finding, location: { assetId: 'a', quote: 'Guaranteed approval' } }])
      .location.meanIoU,
    0,
  );
  assert.equal(scored([visual], [finding]).location.meanIoU, null);
});
test('aggregation pools counts, excludes undefined latency, and preserves unknown cost', () => {
  const s = scored([issue], [finding]);
  const result = aggregate([
    {
      score: s,
      analysis: { status: 'succeeded' },
      latencyMs: 1000,
      knownCostUsd: 0.2,
      spans: [{ operation: 'review' }],
      unknownCostCalls: 1,
    },
    { score: scored([issue], []), error: 'failed' },
  ]);
  assert.equal(result.requiredRecall, 0.5);
  assert.equal(result.completed, 1);
  assert.equal(result.scoredRuns, 2);
  assert.equal(result.errors, 1);
  assert.equal(result.meanLatencyMs, 1000);
  assert.equal(result.knownCostUsd, 0.2);
  assert.equal(result.unknownCostCalls, 1);
});

test('required extras on flawed cases remain manual judgments, separate from clean false positives', () => {
  const extra = { ...finding, policyId: 'other' };
  const result = scored([issue], [extra]);
  assert.deepEqual(result.requiredFalsePositives, []);
  const summary = aggregate([{ score: result }]);
  assert.equal(summary.extraRequiredCount, 1);
  assert.equal(summary.cleanRequiredFalsePositives, 0);
  assert.equal(aggregate([{ score: scored([], [extra], true) }]).cleanRequiredFalsePositives, 1);
});

test('partly clean landing page treats any other required finding as a false positive', () => {
  const soft = { ...issue, id: 'soft', severity: 'recommended' };
  const result = score({ issues: [soft] }, { findings: [finding] }, assets, false, true);
  assert.equal(result.extras.length, 0);
  assert.equal(result.requiredFalsePositives.length, 1);
  assert.equal(aggregate([{ score: result }]).requiredFalsePositivesCount, 1);
  assert.equal(aggregate([{ score: result }]).cleanRequiredFalsePositives, 0);
});
