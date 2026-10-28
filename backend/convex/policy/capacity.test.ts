import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api } from '../_generated/api';
import { workspace, must } from './test.helpers';
import { RULE_LIMIT } from './capacity';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('applying a new publication at rule capacity is atomic and owner scoped', async () => {
  const { t, alice, bob } = await workspace();
  const initial = await alice.query(api.policies.list, {});
  await t.run(async (ctx) => {
    for (let index = initial.length; index < RULE_LIMIT; index++) {
      const key = `custom-capacity-${index}`;
      await ctx.db.insert('policies', {
        owner: 'https://auth.example|alice',
        key,
        kind: 'clearpath_standard',
        currentVersion: 1,
        source: { label: 'ClearPath', url: null, monitor: { type: 'internal' } },
        lastChangedAt: Date.now(),
      });
      await ctx.db.insert('policyVersions', {
        owner: 'https://auth.example|alice',
        key,
        version: 1,
        title: key,
        appliesTo: {},
        check: 'Review marketing claims.',
        changeSummary: 'Reviewer-written rule.',
        createdBy: 'reviewer',
        createdAt: Date.now(),
      });
    }
  });
  const addUpdate = (owner: string) =>
    t.run((ctx) =>
      ctx.db.insert('policyUpdates', {
        owner,
        fingerprint: 'new-publication',
        key: null,
        title: 'New marketing guidance',
        kind: 'new_rule',
        appliesTo: {},
        detectedAt: Date.now(),
        evidence: {
          url: 'https://agency.example/new-guidance',
          excerpt: 'Disclose payment terms.',
        },
        aiSummary: 'New payment guidance.',
        proposedCheck: 'Disclose payment terms.',
        status: 'open',
      }),
    );
  const updateId = await addUpdate('https://auth.example|alice');
  await expect(
    alice.mutation(api.policies.apply, {
      updateId,
      check: 'Disclose payment terms.',
      expectedVersion: 0,
    }),
  ).rejects.toThrow('supports up to 250 rules');
  await expect(
    alice.mutation(api.policy.customRules.add, {
      title: 'One more rule',
      kind: 'clearpath_standard',
      jurisdiction: 'federal',
      appliesTo: {},
      check: 'Check disclosures.',
    }),
  ).rejects.toThrow('supports up to 250 rules');
  await alice.mutation(api.policies.initialize, {});
  expect(await alice.query(api.policies.list, {})).toHaveLength(RULE_LIMIT);
  const stored = await t.run(async (ctx) => ({
    policies: (await ctx.db.query('policies').collect()).length,
    versions: (await ctx.db.query('policyVersions').collect()).length,
    update: await ctx.db.get('policyUpdates', updateId),
    rechecks: await ctx.db.query('policyRechecks').collect(),
  }));
  expect(stored.policies).toBe(RULE_LIMIT);
  expect(stored.versions).toBe(RULE_LIMIT);
  expect(stored.update?.status).toBe('open');
  expect(stored.rechecks).toHaveLength(0);
  await bob.mutation(api.policies.initialize, {});
  await expect(
    bob.mutation(api.policies.apply, {
      updateId,
      check: 'Other owner.',
      expectedVersion: 0,
    }),
  ).rejects.toThrow('Open update not found');
  expect(
    await bob.mutation(api.policies.apply, {
      updateId: await addUpdate('https://auth.example|bob'),
      check: 'Disclose payment terms.',
      expectedVersion: 0,
    }),
  ).toBe(0);
  expect(await bob.query(api.policies.list, {})).toHaveLength(initial.length + 1);
});

test('a legacy oversized library fails visibly instead of truncating rules or duplicating a seed', async () => {
  const { t, alice } = await workspace();
  await t.run(async (ctx) => {
    const seed = must(await ctx.db.query('policies').first());
    const { _id: _id, _creationTime: _time, ...row } = seed;
    for (let index = 0; index < RULE_LIMIT; index++)
      await ctx.db.insert('policies', { ...row, key: `legacy-overflow-${index}` });
  });
  const count = await t.run(async (ctx) => (await ctx.db.query('policies').collect()).length);
  await expect(alice.query(api.policies.list, {})).rejects.toThrow('exceeds its rule limit');
  await expect(alice.mutation(api.policies.initialize, {})).rejects.toThrow(
    'exceeds its rule limit',
  );
  expect(await t.run(async (ctx) => (await ctx.db.query('policies').collect()).length)).toBe(count);
});
