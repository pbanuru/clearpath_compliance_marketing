import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { score } from '../lib/score.mjs';
const readKey = async (id) =>
  JSON.parse(await readFile(new URL(`../answer-key/${id}.json`, import.meta.url), 'utf8'));
test('lead-allowed optional findings are neither extras nor clean/partial false positives', async () => {
  for (const id of ['loan-social-v2', 'landing-page']) {
    const key = await readKey(id);
    const issue = key.issues.find((i) => i.optional && i.allowRequired);
    const anchor = issue.anchors[0];
    const finding = {
      policyId: issue.policyIds[0],
      severity: 'required',
      location: { assetId: 'a', quote: anchor.quote },
    };
    const result = score(
      key,
      { findings: [finding] },
      { [anchor.asset]: 'a' },
      id === 'loan-social-v2',
      id === 'landing-page',
    );
    assert.equal(result.extras.length, 0);
    assert.equal(result.requiredFalsePositives.length, 0);
    assert.equal(result.issues.find((i) => i.id === issue.id).caught, true);
    const unknown = score(
      key,
      { findings: [{ ...finding, policyId: 'other' }] },
      { [anchor.asset]: 'a' },
      id === 'loan-social-v2',
      id === 'landing-page',
    );
    assert.equal(unknown.requiredFalsePositives.length, 1);
  }
});
test('Round 2 keeps fixed coverage rules and adds policy-grounded required issues', async () => {
  const landing = await readKey('landing-page'),
    video = await readKey('affiliate-video');
  assert.equal(landing.issues.filter((i) => !i.optional && i.severity === 'required').length, 2);
  assert.equal(video.issues.filter((i) => !i.optional && i.severity === 'required').length, 4);
  assert.deepEqual(video.issues.find((i) => i.id === 'rate-credit-dependence').policyIds, [
    'advertised-rate-available',
  ]);
  for (const id of ['holdout-sms', 'affiliate-video'])
    assert.ok(
      (await readKey(id)).issues
        .find((i) => i.id === 'lender-identity')
        .policyIds.includes('state-availability'),
    );
});
