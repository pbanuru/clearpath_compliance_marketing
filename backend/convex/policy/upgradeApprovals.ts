import { v } from 'convex/values';
import { internalMutation, type MutationCtx, type QueryCtx } from '../_generated/server';
import { internal } from '../_generated/api';

export async function upgradeApprovals(ctx: MutationCtx, owner: string) {
  const workspace = await ctx.db
    .query('policyWorkspaces')
    .withIndex('by_owner', (q) => q.eq('owner', owner))
    .unique();
  if (!workspace || workspace.approvalMigration?.complete) return;
  // These patches do not change updatedAt, so the continuation stays stable.
  const page = await ctx.db
    .query('reviews')
    .withIndex('by_owner_and_updatedAt', (q) => q.eq('owner', owner))
    .paginate({
      cursor: workspace.approvalMigration?.cursor ?? null,
      numItems: 100,
      maximumBytesRead: 1024 * 1024,
    });
  let history = 0,
    rechecks = 0;
  for (const r of page.page) {
    let approved = !!r.wasApproved || r.status === 'approved';
    const legacyRecheck = r.recheck && r.wasApproved === undefined;
    if (!approved && legacyRecheck)
      for await (const decision of ctx.db
        .query('decisions')
        .withIndex('by_reviewId_and_version', (q) => q.eq('reviewId', r._id))) {
        if (decision.owner === owner && decision.outcome === 'approved') {
          approved = true;
          break;
        }
      }
    if (!approved || r.wasApproved) continue;
    const reopened = !!legacyRecheck && r.status === 'in_review' && !r.recheckOpen;
    await ctx.db.patch('reviews', r._id, {
      wasApproved: true,
      ...(reopened ? { recheckOpen: true } : {}),
    });
    if (r.status !== 'approved') history++;
    if (reopened) rechecks++;
  }
  const counts = await ctx.db
    .query('reviewCounts')
    .withIndex('by_owner', (q) => q.eq('owner', owner))
    .unique();
  if (counts && (counts.approvedHistory === undefined || history || rechecks))
    await ctx.db.patch('reviewCounts', counts._id, {
      approvedHistory: (counts.approvedHistory ?? counts.approved) + history,
      rechecks: (counts.rechecks ?? 0) + rechecks,
    });
  await ctx.db.patch('policyWorkspaces', workspace._id, {
    approvalMigration: { cursor: page.continueCursor, complete: page.isDone },
  });
  if (!page.isDone)
    await ctx.scheduler.runAfter(0, internal.policy.upgradeApprovals.run, { owner });
}

export const run = internalMutation({
  args: { owner: v.string() },
  returns: v.null(),
  handler: async (ctx, { owner }) => {
    await upgradeApprovals(ctx, owner);
    return null;
  },
});

export async function approvedReviews(ctx: QueryCtx, owner: string) {
  const workspace = await ctx.db
    .query('policyWorkspaces')
    .withIndex('by_owner', (q) => q.eq('owner', owner))
    .unique();
  return workspace?.approvalMigration?.complete
    ? ctx.db
        .query('reviews')
        .withIndex('by_owner_and_wasApproved_and_updatedAt', (q) =>
          q.eq('owner', owner).eq('wasApproved', true),
        )
    : ctx.db
        .query('reviews')
        .withIndex('by_owner_and_status_and_updatedAt', (q) =>
          q.eq('owner', owner).eq('status', 'approved'),
        );
}
