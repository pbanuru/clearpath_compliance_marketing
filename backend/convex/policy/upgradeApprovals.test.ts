import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { FunctionReturnType } from 'convex/server';
import { api, internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import { aliceIdentity, setup } from '../reviewTest.helpers';
import { must } from './test.helpers';

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('approval backfill continues beyond 500 without hiding legacy approvals or touching another owner', async () => {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity),
    bob = t.withIdentity({ ...aliceIdentity, tokenIdentifier: 'https://auth.example|bob' });
  const assetId = await alice.mutation(api.assets.createText, { name: 'Legacy', text: 'Loan ad' });
  const ids: Id<'reviews'>[] = [];
  const foreign = await t.run(async (ctx) => {
    for (let index = 0; index <= 500; index++)
      ids.push(
        await ctx.db.insert('reviews', {
          owner: aliceIdentity.tokenIdentifier,
          title: `Approved ${index}`,
          product: 'personal_loan',
          channel: 'social',
          jurisdictions: ['US'],
          status: 'approved',
          currentVersion: 1,
          createdAt: index,
          updatedAt: index,
          waitingSince: index,
          coverAssetId: assetId,
          counts: { required: 0, recommended: 0, needs_context: 0 },
          queueBucket: 'approved',
          resubmissionRank: 1,
        }),
      );
    const review = must(await ctx.db.get('reviews', must(ids[0])));
    const { _id, _creationTime, ...row } = review;
    await ctx.db.insert('reviewCounts', {
      owner: row.owner,
      needs_review: 0,
      changes_requested: 0,
      approved: 501,
      all: 501,
    });
    return ctx.db.insert('reviews', { ...row, owner: 'https://auth.example|bob' });
  });
  async function listed() {
    const rows: Id<'reviews'>[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page: FunctionReturnType<typeof api.reviews.list> = await alice.query(
        api.reviews.list,
        {
          filter: 'approved',
          paginationOpts: { numItems: 100, cursor },
        },
      );
      rows.push(...page.page.map((r) => r._id));
      if (page.isDone) return rows;
      cursor = page.continueCursor;
    }
  }
  expect(await listed()).toEqual([...ids].reverse());
  await alice.mutation(api.policies.initialize, {});
  expect(await listed()).toHaveLength(501);
  const migrated = () =>
    t.run((ctx) =>
      ctx.db
        .query('reviews')
        .withIndex('by_owner_and_wasApproved_and_updatedAt', (q) =>
          q.eq('owner', aliceIdentity.tokenIdentifier).eq('wasApproved', true),
        )
        .collect(),
    );
  expect(await migrated()).toHaveLength(100);
  await alice.mutation(api.policies.initialize, {});
  expect(await migrated()).toHaveLength(200);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await migrated()).toHaveLength(501);
  expect(await listed()).toEqual([...ids].reverse());
  expect(await bob.query(api.policy.rechecks.count, {})).toBe(0);
  expect((await t.run((ctx) => ctx.db.get('reviews', foreign)))?.wasApproved).toBeUndefined();
  await alice.mutation(api.policies.initialize, {});
  expect((await alice.query(api.reviews.counts, {})).approved).toBe(501);
});

test('legacy reopened approvals beyond 500 restore history once and preserve decisions', async () => {
  const t = setup(),
    alice = t.withIdentity(aliceIdentity);
  const assetId = await alice.mutation(api.assets.createText, { name: 'Ad', text: 'Loan ad' });
  await t.run(async (ctx) => {
    await ctx.db.insert('policyWorkspaces', { owner: aliceIdentity.tokenIdentifier });
    await ctx.db.insert('reviewCounts', {
      owner: aliceIdentity.tokenIdentifier,
      needs_review: 502,
      changes_requested: 0,
      approved: 0,
      approvedHistory: 1,
      all: 502,
    });
    for (let index = 0; index <= 501; index++) {
      const reviewId = await ctx.db.insert('reviews', {
        owner: aliceIdentity.tokenIdentifier,
        title: `Reopened ${index}`,
        product: 'personal_loan',
        channel: 'social',
        jurisdictions: ['US'],
        status: 'in_review',
        currentVersion: 1,
        createdAt: index,
        updatedAt: index,
        waitingSince: index,
        coverAssetId: assetId,
        counts: { required: 0, recommended: 0, needs_context: 0 },
        queueBucket: 'needs_review',
        resubmissionRank: 1,
        ...(index === 501 ? { wasApproved: true, recheckOpen: false } : {}),
        recheck: {
          key: 'fair-lending',
          fromVersion: 1,
          toVersion: 2,
          title: 'Fair lending',
          changeSummary: 'Updated rule',
        },
      });
      // The last review already completed its recheck workflow. Do not reopen it.
      if (index === 500)
        for (let decision = 0; decision < 100; decision++)
          await ctx.db.insert('decisions', {
            owner: aliceIdentity.tokenIdentifier,
            reviewId,
            version: 1,
            outcome: 'changes_requested',
            acceptedFindingIds: [],
            decidedAt: decision,
          });
      await ctx.db.insert('decisions', {
        owner: aliceIdentity.tokenIdentifier,
        reviewId,
        version: 1,
        outcome: 'approved',
        acceptedFindingIds: [],
        decidedAt: index,
      });
    }
  });
  await alice.mutation(api.policies.initialize, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await alice.query(api.policy.rechecks.count, {})).toBe(501);
  expect((await alice.query(api.reviews.counts, {})).approved).toBe(502);
  expect(await t.run((ctx) => ctx.db.query('decisions').collect())).toHaveLength(602);
  const workspace = must(
    await t.run((ctx) =>
      ctx.db
        .query('policyWorkspaces')
        .withIndex('by_owner', (q) => q.eq('owner', aliceIdentity.tokenIdentifier))
        .unique(),
    ),
  );
  expect(workspace.approvalMigration?.complete).toBe(true);
  await t.mutation(internal.policy.upgradeApprovals.run, { owner: aliceIdentity.tokenIdentifier });
  await alice.mutation(api.policies.initialize, {});
  expect(await alice.query(api.policy.rechecks.count, {})).toBe(501);
  expect((await alice.query(api.reviews.counts, {})).approved).toBe(502);
});
