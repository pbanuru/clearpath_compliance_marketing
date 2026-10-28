import { beforeEach, afterEach, test, expect, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { exampleText } from './demo';
import { must } from './test.helpers';
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});
test('example update uses normal versioning and reopened approvals remain in Approved and Rechecks', async () => {
  const { t, alice, bob, reviewId, findingId } = await fixture();
  await alice.mutation(api.findings.setStatus, { findingId, status: 'dismissed' });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
  expect(await alice.mutation(api.policy.demo.applyExample, { expectedVersion: 1 })).toBe(1);
  const versions = await alice.query(api.policies.history, { key: 'advertised-rate-available' });
  expect(versions[0]).toMatchObject({
    version: 2,
    createdBy: 'reviewer',
    changeSummary: 'Payment examples must also show the total amount repaid.',
  });
  expect(versions[0]?.check.endsWith(exampleText)).toBe(true);
  await expect(
    alice.mutation(api.policy.demo.applyExample, { expectedVersion: 2 }),
  ).rejects.toThrow('already been applied');
  const id = must((await t.run((ctx) => ctx.db.query('policyRechecks').collect()))[0])._id;
  const loaded = must(await t.mutation(internal.policy.recheckState.start, { id }));
  await t.mutation(internal.policy.recheckState.finish, {
    id,
    runKey: loaded.runKey,
    spans: [],
    result: {
      summary: 'Payment example omits total repaid.',
      findings: [
        {
          policyId: 'advertised-rate-available',
          title: 'Show total repaid',
          explanation: 'The monthly example does not show the total.',
          suggestedFix: 'State the total amount repaid.',
          confidence: 'high',
          severity: 'required',
        },
      ],
      previous: [],
    },
  });
  const data = await alice.query(api.reviews.get, { reviewId });
  expect(data.review).toMatchObject({
    wasApproved: true,
    recheckOpen: true,
    recheck: {
      newFindings: 1,
      fromVersion: 1,
      toVersion: 2,
      oldCheck: loaded.job.oldCheck,
      newCheck: loaded.job.newCheck,
    },
  });
  expect(data.decisions).toHaveLength(1);
  expect(data.review.recheck?.approvedAt).toBe(data.decisions[0]?.decidedAt);
  const args = { paginationOpts: { numItems: 25, cursor: null } };
  expect(
    (await alice.query(api.reviews.list, { ...args, filter: 'approved' })).page.map((r) => r._id),
  ).toEqual([reviewId]);
  expect(
    (await alice.query(api.reviews.list, { ...args, filter: 'rechecks' })).page.map((r) => r._id),
  ).toEqual([reviewId]);
  expect(await alice.query(api.policy.rechecks.count, {})).toBe(1);
  expect((await alice.query(api.reviews.counts, {})).approved).toBe(1);
  expect((await bob.query(api.reviews.list, { ...args, filter: 'rechecks' })).page).toEqual([]);
  const finding = must(data.findings.find((f) => f.source === 'recheck'));
  await alice.mutation(api.findings.setStatus, { findingId: finding._id, status: 'accepted' });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'changes_requested' });
  expect(await alice.query(api.policy.rechecks.count, {})).toBe(0);
  expect((await alice.query(api.reviews.list, { ...args, filter: 'approved' })).page).toHaveLength(
    1,
  );
});
