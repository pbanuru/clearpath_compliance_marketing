import type { MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';

export async function refreshRecheckFailure(ctx: MutationCtx, review: Doc<'reviews'>) {
  const jobs = await ctx.db
    .query('policyRechecks')
    .withIndex('by_reviewId', (q) => q.eq('reviewId', review._id))
    .take(500);
  let failed = false;
  for (const job of jobs) {
    if (job.status !== 'failed' || job.version !== review.currentVersion) continue;
    const policy = await ctx.db
      .query('policies')
      .withIndex('by_owner_and_key', (q) => q.eq('owner', review.owner).eq('key', job.key))
      .unique();
    if (policy?.currentVersion === job.toVersion) failed = true;
  }
  await ctx.db.patch('reviews', review._id, { recheckFailed: failed });
}
