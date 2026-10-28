import type { MutationCtx } from '../_generated/server';
export async function upgradeApprovals(ctx: MutationCtx, owner: string) {
  const approved = await ctx.db
    .query('reviews')
    .withIndex('by_owner_and_status_and_updatedAt', (q) =>
      q.eq('owner', owner).eq('status', 'approved'),
    )
    .take(500);
  for (const r of approved)
    if (!r.wasApproved) await ctx.db.patch('reviews', r._id, { wasApproved: true });
  const reviews = await ctx.db
    .query('reviews')
    .withIndex('by_owner_and_status_and_updatedAt', (q) =>
      q.eq('owner', owner).eq('status', 'in_review'),
    )
    .take(500);
  let restored = 0;
  for (const r of reviews)
    if (r.recheck && !r.recheckOpen) {
      const decisions = await ctx.db
        .query('decisions')
        .withIndex('by_reviewId_and_version', (q) => q.eq('reviewId', r._id))
        .take(100);
      if (!decisions.some((d) => d.outcome === 'approved')) continue;
      await ctx.db.patch('reviews', r._id, { wasApproved: true, recheckOpen: true });
      restored++;
    }
  const counts = await ctx.db
    .query('reviewCounts')
    .withIndex('by_owner', (q) => q.eq('owner', owner))
    .unique();
  if (counts && (counts.approvedHistory === undefined || restored))
    await ctx.db.patch('reviewCounts', counts._id, {
      approvedHistory: counts.approvedHistory ?? counts.approved + restored,
      rechecks: (counts.rechecks ?? 0) + restored,
    });
}
