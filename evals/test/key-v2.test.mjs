import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { score, match } from '../lib/score.mjs';
import { rescore } from '../lib/rescore.mjs';

const box = { x: 0.1, y: 0.9, width: 0.7, height: 0.02 };
const disclosure = {
  policyIds: ['endorsements', 'native-advertising', 'clear-conspicuous'],
  severity: 'required',
  coverageRule: 'bottom-only-disclosure',
  coveragePolicyIds: ['native-advertising', 'endorsements'],
  anchors: [{ asset: 'page', quote: 'This article is a paid advertisement.', region: box }],
};
const finding = {
  _id: 'finding',
  severity: 'required',
  policyId: 'native-advertising',
  title: 'Paid promotion looks like independent journalism',
  explanation:
    'The advertising and compensation disclosure appears only in small, faint text at the very bottom, after the article.',
  location: { assetId: 'page-id', quote: 'Staff Writer', region: { ...box, y: 0.1 } },
};

test('v2 explicit bottom-only disclosure counts from explanation without inventing a footer box', () => {
  const result = match(disclosure, finding, { page: 'page-id' });
  assert.deepEqual(result.methods, ['bottom_only_disclosure']);
  assert.equal(result.iou, 0);
  const grade = score({ issues: [disclosure] }, { findings: [finding] }, { page: 'page-id' });
  assert.equal(grade.requiredCaught, 1);
  assert.equal(grade.location.meanIoU, 0);
  assert.ok(
    match(
      disclosure,
      { ...finding, explanation: 'The only paid-advertisement disclosure is in the footer.' },
      { page: 'page-id' },
    ),
  );
  assert.ok(match(disclosure, { ...finding, location: undefined }, { page: 'page-id' }));
});

test('v2 footer exception rejects generic advice, missing current-only evidence, negation and foreign assets', () => {
  const candidates = [
    {
      ...finding,
      explanation: 'The byline suggests editorial content.',
      suggestedFix: 'Do not put the only advertising disclosure in the footer.',
    },
    {
      ...finding,
      explanation: 'The disclosure appears not only in the footer but also beside the headline.',
    },
    {
      ...finding,
      explanation:
        'The advertising disclosure is in the footer; a clear disclosure is also at the top.',
    },
    { ...finding, location: { ...finding.location, assetId: 'other-page' } },
    { ...finding, policyId: 'approval-claims' },
    { ...finding, policyId: 'clear-conspicuous' },
  ];
  for (const candidate of candidates)
    assert.equal(match(disclosure, candidate, { page: 'page-id' }), null);
});

test('v2 accepted required severity is exempt from partly clean false positives', () => {
  const issue = {
    id: 'footer',
    policyIds: ['clear-conspicuous'],
    severity: 'recommended',
    acceptedSeverities: ['recommended', 'required'],
    anchors: [],
  };
  const result = score(
    { issues: [issue] },
    { findings: [{ ...finding, policyId: 'clear-conspicuous' }] },
    {},
    false,
    true,
  );
  assert.equal(result.severityAgreed, 1);
  assert.equal(result.requiredFalsePositives.length, 0);
});

test('v2 optional lender issue catches required detection and retains the severity disagreement', () => {
  const issue = {
    id: 'lender',
    policyIds: ['state-availability'],
    severity: 'recommended',
    anchors: [],
    optional: true,
    matchAnySeverity: true,
  };
  const result = score(
    { issues: [issue] },
    { findings: [{ ...finding, policyId: 'state-availability' }] },
    {},
  );
  assert.equal(result.issues[0].caught, true);
  assert.equal(result.issues[0].agreement, false);
  assert.equal(result.extras.length, 0);
  assert.equal(result.severityCompared, 0);
});

test('current-key regrading uses saved raw data and preserves original reports, spans, costs and input bytes', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'clearpath-key-v2-'));
  try {
    const id = 'holdout-card-email-clean';
    const raw = {
      versions: [{ number: 1, analysis: { status: 'succeeded' } }],
      findings: [{ ...finding, policyId: 'open-end-trigger-terms' }],
    };
    const report = {
      startedAt: '2026-10-28T00:00:00Z',
      identity: { subject: 'offline-test' },
      caseIds: [id],
      plannedRuns: 1,
      callsUsed: 1,
      callBudget: 39,
      keys: { [id]: { caseId: id, issues: [] } },
      runs: [
        {
          caseId: id,
          number: 1,
          finished: true,
          clean: true,
          assets: { email: 'page-id' },
          analysis: { status: 'succeeded' },
          knownCostUsd: 0.123,
          spans: [{ operation: 'review', model: 'fixture', costUsd: 0.123 }],
        },
      ],
    };
    const originalBytes = JSON.stringify(report);
    const rawBytes = JSON.stringify(raw);
    await writeFile(resolve(directory, 'report.json'), originalBytes);
    await writeFile(resolve(directory, `${id}-1.json`), rawBytes);
    await rescore(directory, { currentKey: true });
    assert.equal(await readFile(resolve(directory, 'report.json'), 'utf8'), originalBytes);
    assert.equal(await readFile(resolve(directory, `${id}-1.json`), 'utf8'), rawBytes);
    const graded = JSON.parse(await readFile(resolve(directory, 'report-key-v3.json'), 'utf8'));
    assert.equal(graded.keyVersion, 3);
    assert.equal(graded.originalKeyVersion, 1);
    assert.equal(graded.callsUsed, 1);
    assert.equal(graded.aggregate.knownCostUsd, 0.123);
    assert.equal(graded.aggregate.requiredCaught, 1);
    assert.equal(graded.aggregate.requiredTotal, 1);
    assert.equal(graded.runs[0].clean, false);
    assert.equal(graded.runs[0].score.requiredFalsePositives.length, 0);
    assert.deepEqual(graded.runs[0].spans, report.runs[0].spans);
    await rescore(directory);
    const frozen = JSON.parse(await readFile(resolve(directory, 'report.json'), 'utf8'));
    assert.equal(frozen.keyVersion, 1);
    assert.equal(frozen.aggregate.requiredTotal, 0);
    assert.equal(frozen.runs[0].score.requiredFalsePositives.length, 1);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test('v2 keys are one version and former clean holdouts each contain exactly one required issue', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../cases/manifest.json', import.meta.url), 'utf8'),
  );
  for (const c of manifest) {
    const key = JSON.parse(
      await readFile(new URL(`../answer-key/${c.id}.json`, import.meta.url), 'utf8'),
    );
    assert.equal(key.version, 3);
    if (['holdout-card-email-clean', 'holdout-search-ad-clean'].includes(c.id)) {
      assert.equal(Boolean(c.clean), false);
      assert.equal(c.otherRequiredAreFalsePositives, true);
      assert.equal(key.issues.filter((i) => !i.optional && i.severity === 'required').length, 1);
      assert.equal(c.notes, undefined);
    }
  }
});
