import { must } from './test.helpers';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, internal } from '../_generated/api';
import { fixture } from '../reviewTest.helpers';
import { workspace } from './test.helpers';
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('lazy initialization is idempotent per owner and isolates policies and sources', async () => {
  const { t, alice, bob } = await workspace();
  await alice.mutation(api.policies.initialize, {});
  expect(await alice.query(api.policies.list, {})).toHaveLength(19);
  expect(await t.run((ctx) => ctx.db.query('policies').collect())).toHaveLength(19);
  await bob.mutation(api.policies.initialize, {});
  await alice.mutation(api.policies.edit, {
    key: 'advertised-rate-available',
    expectedVersion: 1,
    check: 'Show a representative payment.',
    changeSummary: 'Add payment examples.',
  });
  expect(
    (await alice.query(api.policies.list, {})).find((p) => p.key === 'advertised-rate-available')
      ?.currentVersion,
  ).toBe(2);
  expect(
    (await bob.query(api.policies.list, {})).find((p) => p.key === 'advertised-rate-available')
      ?.currentVersion,
  ).toBe(1);
  expect(await t.run((ctx) => ctx.db.query('policies').collect())).toHaveLength(38);
  const sources = await alice.query(api.policy.sourceManagement.list, {});
  await expect(
    bob.mutation(api.policy.sourceManagement.setPaused, { id: must(sources[0])._id, paused: true }),
  ).rejects.toThrow('Source not found');
  await expect(
    bob.mutation(api.policy.sourceManagement.remove, { id: must(sources[0])._id }),
  ).rejects.toThrow('Source not found');
  await expect(
    bob.mutation(api.policy.sourceManagement.retry, { id: must(sources[0])._id }),
  ).rejects.toThrow('Active source not found');
  expect(
    await alice.query(api.policies.history, { key: 'advertised-rate-available' }),
  ).toHaveLength(2);
});

test('reviewer-written state rules are versioned, owner-scoped, and read by analysis for the jurisdiction', async () => {
  const { t, alice, bob } = await workspace();
  const key = await alice.mutation(api.policy.customRules.add, {
    title: 'California rate example',
    kind: 'state_rule',
    jurisdiction: 'CA',
    check: 'State a representative payment.',
    appliesTo: { products: ['personal_loan'] },
    sourceUrl: 'https://dfpi.ca.gov/',
  });
  expect(await bob.query(api.policies.history, { key })).toEqual([]);
  const assetId = await alice.mutation(api.assets.createText, { name: 'Ad', text: 'A lender ad.' });
  for (const jurisdiction of ['CA', 'NY', 'US']) {
    const reviewId = await alice.mutation(api.reviews.create, {
      title: jurisdiction,
      product: 'personal_loan',
      channel: 'social',
      jurisdictions: [jurisdiction],
      assetIds: [assetId],
    });
    const loaded = await t.mutation(internal.review.state.start, { reviewId, version: 1 });
    expect(loaded?.policies.some((p) => p.id === key)).toBe(jurisdiction !== 'NY');
  }
  await expect(
    alice.mutation(api.policies.edit, {
      key: 'fair-lending',
      expectedVersion: 1,
      check: 'Changed.',
      changeSummary: 'Change.',
    }),
  ).rejects.toThrow('External rules');
});

test('applying an update versions the rule and queues only approved non-retired matching material', async () => {
  const { t, alice, bob } = await workspace();
  const assetId = await alice.mutation(api.assets.createText, { name: 'Ad', text: 'A lender ad.' });
  const ids = [];
  for (const [channel, usage, status] of [
    ['email', 'live', 'approved'],
    ['email', 'unknown', 'approved'],
    ['email', 'retired', 'approved'],
    ['social', 'live', 'approved'],
    ['email', 'live', 'in_review'],
  ] as const) {
    const id = await alice.mutation(api.reviews.create, {
      title: channel,
      channel,
      product: 'personal_loan',
      jurisdictions: ['US'],
      assetIds: [assetId],
    });
    ids.push(id);
    await t.run((ctx) => ctx.db.patch('reviews', id, { status, usage }));
  }
  const updateId = await t.run((ctx) =>
    ctx.db.insert('policyUpdates', {
      owner: 'https://auth.example|alice',
      fingerprint: 'test-amendment',
      key: 'email-can-spam',
      title: 'Email',
      kind: 'amended',
      appliesTo: { channels: ['email'] },
      detectedAt: Date.now(),
      evidence: { url: 'https://www.ecfr.gov/current/title-16/part-316', excerpt: 'Amendment' },
      aiSummary: 'Clarified opt-out.',
      proposedCheck: 'Include clear opt-out instructions.',
      status: 'open',
    }),
  );
  await expect(
    bob.mutation(api.policies.apply, { updateId, check: 'New check.', expectedVersion: 1 }),
  ).rejects.toThrow('Open update not found');
  expect(await alice.query(api.policies.preview, { updateId })).toBe(2);
  expect(
    await alice.mutation(api.policies.apply, {
      updateId,
      check: 'Include clear opt-out instructions.',
      expectedVersion: 1,
    }),
  ).toBe(2);
  const jobs = await t.run((ctx) => ctx.db.query('policyRechecks').collect());
  expect(jobs.map((j) => j.reviewId).sort()).toEqual(ids.slice(0, 2).sort());
  expect(jobs.every((j) => j.fromVersion === 1 && j.toVersion === 2 && j.status === 'queued')).toBe(
    true,
  );
  expect((await alice.query(api.policies.history, { key: 'email-can-spam' }))[0]).toMatchObject({
    version: 2,
    createdBy: 'source_update',
  });
  await expect(
    alice.mutation(api.policies.apply, { updateId, check: 'New check.', expectedVersion: 1 }),
  ).rejects.toThrow('Open update not found');
});

test('usage control derives ownership and accepts only approved reviews', async () => {
  const { alice, bob, reviewId, findingId } = await fixture();
  await expect(
    alice.mutation(api.policy.rechecks.setUsage, { reviewId, usage: 'live' }),
  ).rejects.toThrow('approved material');
  await alice.mutation(api.findings.setStatus, { findingId, status: 'dismissed' });
  await alice.mutation(api.reviews.decide, { reviewId, version: 1, outcome: 'approved' });
  await alice.mutation(api.policy.rechecks.setUsage, { reviewId, usage: 'live' });
  expect((await alice.query(api.reviews.get, { reviewId })).review.usage).toBe('live');
  await expect(
    bob.mutation(api.policy.rechecks.setUsage, { reviewId, usage: 'retired' }),
  ).rejects.toThrow('Review not found');
});

test('missing seeded rules upgrade an existing workspace without resetting versions or removed sources', async () => {
  const { t, alice } = await workspace();
  const sources = await alice.query(api.policy.sourceManagement.list, {});
  const source = must(sources.find((s) => s.label === 'CFPB newsroom'));
  await alice.mutation(api.policy.sourceManagement.remove, { id: source._id });
  await alice.mutation(api.policies.edit, {
    key: 'advertised-rate-available',
    expectedVersion: 1,
    check: 'Show a payment example.',
    changeSummary: 'Add examples.',
  });
  await t.run(async (ctx) => {
    const p = await ctx.db
      .query('policies')
      .withIndex('by_owner_and_key', (q) =>
        q.eq('owner', 'https://auth.example|alice').eq('key', 'native-advertising'),
      )
      .unique();
    await ctx.db.delete('policies', must(p)._id);
    const v = await ctx.db
      .query('policyVersions')
      .withIndex('by_owner_and_key_and_version', (q) =>
        q
          .eq('owner', 'https://auth.example|alice')
          .eq('key', 'native-advertising')
          .eq('version', 1),
      )
      .unique();
    await ctx.db.delete('policyVersions', must(v)._id);
  });
  await alice.mutation(api.policies.initialize, {});
  const library = await alice.query(api.policies.list, {});
  expect(library.find((p) => p.key === 'native-advertising')).toMatchObject({
    currentVersion: 1,
    kind: 'guidance',
    source: { monitor: { type: 'page' } },
  });
  expect(library.find((p) => p.key === 'advertised-rate-available')?.currentVersion).toBe(2);
  expect(
    (await alice.query(api.policy.sourceManagement.list, {})).some(
      (s) => s.label === 'CFPB newsroom',
    ),
  ).toBe(false);
});
