import { must } from './test.helpers';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { response, output } from '../pipelineTest.helpers';
import { fetcher } from './test.helpers';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubEnv('OPENAI_API_KEY', 'stub');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllTimers();
  vi.useRealTimers();
});
async function approved() {
  const f = await fixture();
  await f.alice.mutation(api.findings.setStatus, { findingId: f.findingId, status: 'dismissed' });
  await f.alice.mutation(api.reviews.decide, {
    reviewId: f.reviewId,
    version: 1,
    outcome: 'approved',
    note: 'Approved under version 1 of the policy.',
  });
  await f.alice.mutation(api.policy.rechecks.setUsage, { reviewId: f.reviewId, usage: 'live' });
  await f.alice.mutation(api.policies.edit, {
    key: 'advertised-rate-available',
    expectedVersion: 1,
    check: 'Every advertised rate must include a representative payment example.',
    changeSummary: 'Require a representative payment example.',
  });
  const jobs = await f.t.run((ctx) => ctx.db.query('policyRechecks').collect());
  return { ...f, id: must(jobs[0])._id };
}
test('recheck findings reopen the review, retain earlier decision, and record rule versions and cost spans', async () => {
  const { t, alice, reviewId, id, assetId } = await approved(),
    body = output(assetId);
  must(body.findings[0]).policyId = 'advertised-rate-available';
  must(body.findings[0]).title = 'Add a representative payment';
  const fetch = fetcher(() => response(JSON.stringify(body)));
  await t.action(internal.policy.recheck.run, { id });
  const data = await alice.query(api.reviews.get, { reviewId });
  expect(data.review).toMatchObject({
    status: 'in_review',
    recheck: { key: 'advertised-rate-available', fromVersion: 1, toVersion: 2 },
    pendingRechecks: 0,
    recheckFailed: false,
  });
  expect(data.decisions).toHaveLength(1);
  expect(data.decisions[0]).toMatchObject({
    outcome: 'approved',
    note: 'Approved under version 1 of the policy.',
  });
  expect(data.findings.find((f) => f.source === 'recheck')).toMatchObject({
    policyId: 'advertised-rate-available',
    policyVersion: 2,
    status: 'open',
  });
  expect(data.cost.spans).toBe(1);
  expect(await t.run((ctx) => ctx.db.query('aiSpans').first())).toMatchObject({
    operation: 'recheck',
  });
  const call = fetch.mock.calls[0];
  expect(call?.[0]).toContain('/responses');
  const job = await t.run((ctx) => ctx.db.get('policyRechecks', id));
  expect(job?.status).toBe('findings');
  await t.action(internal.policy.recheck.run, { id });
  expect(fetch).toHaveBeenCalledTimes(1);
});
test('a clean recheck writes recheck_passed and preserves approved status and earlier decision', async () => {
  const { t, alice, reviewId, id } = await approved();
  fetcher(() =>
    response(
      JSON.stringify({ summary: 'No issues under the new rule.', findings: [], previous: [] }),
    ),
  );
  await t.action(internal.policy.recheck.run, { id });
  const data = await alice.query(api.reviews.get, { reviewId });
  expect(data.review.status).toBe('approved');
  expect(data.decisions).toHaveLength(1);
  expect(data.events.find((e) => e.type === 'recheck_passed')?.detail).toBe(
    'Rechecked against Advertised rate availability v2: no issues',
  );
  expect((await t.run((ctx) => ctx.db.get('policyRechecks', id)))?.status).toBe('passed');
});
test('failed rechecks never pass, stay flagged, expose rollout failure and can be retried with both attempt spans retained', async () => {
  const { t, alice, bob, reviewId, id } = await approved();
  fetcher(() => Response.json({ error: { message: 'provider refused' } }, { status: 400 }));
  await t.action(internal.policy.recheck.run, { id });
  let data = await alice.query(api.reviews.get, { reviewId });
  expect(data.review).toMatchObject({
    status: 'approved',
    recheckFailed: true,
    pendingRechecks: 0,
  });
  expect(data.events.some((e) => e.type === 'recheck_passed')).toBe(false);
  expect(
    (
      await alice.query(api.policy.rechecks.list, {
        key: 'advertised-rate-available',
        toVersion: 2,
      })
    )[0]?.status,
  ).toBe('failed');
  await expect(bob.mutation(api.policy.recheckState.retry, { reviewId })).rejects.toThrow(
    'Recheck not found',
  );
  expect(await alice.mutation(api.policy.recheckState.retry, { reviewId })).toBe(1);
  fetcher(() => response(JSON.stringify({ summary: 'Passed.', findings: [], previous: [] })));
  await t.action(internal.policy.recheck.run, { id });
  data = await alice.query(api.reviews.get, { reviewId });
  expect(data.review.recheckFailed).toBe(false);
  expect(data.cost.spans).toBe(2);
  const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
  expect(spans.map((s) => s.status)).toEqual(['failed', 'succeeded']);
});

test('an interrupted recheck records a failed attempt span even without a provider response', async () => {
  const { t, alice, reviewId, id } = await approved();
  const loaded = must(await t.mutation(internal.policy.recheckState.start, { id }));
  await t.mutation(internal.policy.recheckState.finish, {
    id,
    runKey: loaded.runKey,
    result: null,
    error: 'Recheck action interrupted.',
    spans: [],
  });
  const data = await alice.query(api.reviews.get, { reviewId });
  expect(data.review.recheckFailed).toBe(true);
  expect(data.events.some((e) => e.type === 'recheck_passed')).toBe(false);
  const spans = await t.run((ctx) => ctx.db.query('aiSpans').collect());
  expect(spans).toHaveLength(1);
  expect(spans[0]).toMatchObject({
    operation: 'recheck',
    status: 'failed',
    error: 'Recheck action interrupted.',
  });
});
