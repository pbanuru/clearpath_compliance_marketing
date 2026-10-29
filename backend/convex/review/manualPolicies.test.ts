import { expect, test } from 'vitest';
import { api } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { must } from '../policy/test.helpers';

const rate = 'advertised-rate-available',
  soft = 'soft-pull-claims',
  identifiers = 'mortgage-identifiers';
async function update(
  alice: Awaited<ReturnType<typeof fixture>>['alice'],
  key: string,
  version: number,
) {
  return alice.mutation(api.policies.edit, {
    key,
    expectedVersion: version,
    check: `Updated check ${version + 1}.`,
    changeSummary: 'Clarify the check.',
  });
}

test('legacy one-rule findings and Reviewer judgment remain usable without a migration', async () => {
  const { t, alice, reviewId, findingId } = await fixture();
  await t.run((ctx) => ctx.db.patch('findings', findingId, { policyVersion: undefined }));
  await alice.mutation(api.findings.edit, { findingId, title: 'Qualify this claim' });
  const legacy = must(
    (await alice.query(api.reviews.get, { reviewId })).findings.find((f) => f._id === findingId),
  );
  expect(legacy.policyId).toBe('approval-claims');
  expect(legacy.policyVersion).toBeUndefined();
  expect(legacy.additionalPolicies).toBeUndefined();
  const other = await alice.mutation(api.findings.add, {
    reviewId,
    policyId: 'other',
    severity: 'needs_context',
    title: 'Confirm this offer',
    explanation: 'Reviewer judgment.',
  });
  const judgment = must(
    (await alice.query(api.reviews.get, { reviewId })).findings.find((f) => f._id === other),
  );
  expect(judgment.policyId).toBe('other');
  expect(judgment.policyVersion).toBeUndefined();
  expect(judgment.additionalPolicies).toBeUndefined();
});

test('manual reference edits preserve unchanged snapshots, move primary roles, and resolve newly attached rules', async () => {
  const { alice, reviewId, findingId } = await fixture();
  await update(alice, rate, 1);
  await alice.mutation(api.findings.edit, {
    findingId,
    policyId: rate,
    additionalPolicyIds: [soft, soft, rate],
  });
  const read = async () =>
    must(
      (await alice.query(api.reviews.get, { reviewId })).findings.find((f) => f._id === findingId),
    );
  expect(await read()).toMatchObject({
    policyId: rate,
    policyVersion: 2,
    additionalPolicies: [{ key: soft, version: 1 }],
  });
  await update(alice, rate, 2);
  await update(alice, soft, 1);
  await alice.mutation(api.findings.edit, { findingId, explanation: 'Reworded explanation only.' });
  await alice.mutation(api.findings.edit, {
    findingId,
    policyId: rate,
    additionalPolicyIds: [soft],
  });
  expect(await read()).toMatchObject({
    policyId: rate,
    policyVersion: 2,
    additionalPolicies: [{ key: soft, version: 1 }],
  });
  await update(alice, identifiers, 1);
  await alice.mutation(api.findings.edit, {
    findingId,
    policyId: soft,
    additionalPolicyIds: [rate, identifiers],
  });
  expect(await read()).toMatchObject({
    policyId: soft,
    policyVersion: 1,
    additionalPolicies: [
      { key: rate, version: 2 },
      { key: identifiers, version: 2 },
    ],
  });
  await alice.mutation(api.findings.edit, { findingId, additionalPolicyIds: [] });
  expect((await read()).additionalPolicies).toEqual([]);
  await alice.mutation(api.findings.edit, {
    findingId,
    policyId: 'other',
    additionalPolicyIds: [soft],
  });
  expect(await read()).toMatchObject({
    policyId: 'other',
    additionalPolicies: [{ key: soft, version: 1 }],
  });
  expect((await read()).policyVersion).toBeUndefined();
  await alice.mutation(api.findings.edit, { findingId, additionalPolicyIds: [] });
  await alice.mutation(api.findings.edit, { findingId, additionalPolicyIds: [soft] });
  expect((await read()).additionalPolicies).toEqual([{ key: soft, version: 2 }]);
});

test('add and edit reject unknown or another owner’s primary and extra rules', async () => {
  const { alice, bob, reviewId, findingId } = await fixture();
  const privateKey = await bob.mutation(api.policy.customRules.add, {
    title: 'Private team rule',
    jurisdiction: 'federal',
    kind: 'clearpath_standard',
    appliesTo: {},
    check: 'Use our private disclosure.',
  });
  for (const key of ['missing-rule', privateKey]) {
    for (const references of [
      { policyId: key },
      { policyId: 'approval-claims', additionalPolicyIds: [key] },
    ]) {
      await expect(
        alice.mutation(api.findings.add, {
          reviewId,
          severity: 'required',
          title: 'Disclosure',
          explanation: 'A supported issue.',
          ...references,
        }),
      ).rejects.toThrow('Policy not found.');
      await expect(alice.mutation(api.findings.edit, { findingId, ...references })).rejects.toThrow(
        'Policy not found.',
      );
    }
  }
  await expect(
    bob.mutation(api.findings.edit, { findingId, additionalPolicyIds: [] }),
  ).rejects.toThrow('Finding not found.');
});

test('new manual findings and decision CSV retain extra rule versions after library and finding edits', async () => {
  const { alice, reviewId } = await fixture();
  await update(alice, rate, 1);
  const findingId = await alice.mutation(api.findings.add, {
    reviewId,
    severity: 'required',
    policyId: rate,
    additionalPolicyIds: [soft, soft, rate],
    title: 'Qualify rate and inquiry',
    explanation: 'Both rules support the same claim.',
  });
  await update(alice, soft, 1);
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'changes_requested' });
  const decision = must((await alice.query(api.reviews.get, { reviewId })).decisions[0]);
  expect(decision.policyVersions).toContainEqual({ key: rate, version: 2 });
  expect(decision.policyVersions).toContainEqual({ key: soft, version: 1 });
  expect(decision.policyVersions).toContainEqual({ key: soft, version: 2 });
  const before = must((await alice.action(api.reviews.exportDecisions, { filter: 'all' }))[0]);
  expect(before.ruleVersions).toContain(`${soft}@1`);
  expect(before.ruleVersions).toContain(`${soft}@2`);
  // Export is the immutable decision snapshot, not a reconstruction from later findings.
  await expect(
    alice.mutation(api.findings.edit, { findingId, additionalPolicyIds: [] }),
  ).rejects.toThrow('Only current-version');
  await update(alice, soft, 2);
  expect(
    must((await alice.action(api.reviews.exportDecisions, { filter: 'all' }))[0]).ruleVersions,
  ).toBe(before.ruleVersions);
});
