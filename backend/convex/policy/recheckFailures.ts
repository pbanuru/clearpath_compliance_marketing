import type { MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';

export async function refreshRecheckFailure(ctx: MutationCtx, review: Doc<'reviews'>) {
  const jobs = ctx.db
    .query('policyRechecks')
    .withIndex('by_reviewId_and_version_and_status', (q) =>
      q.eq('reviewId', review._id).eq('version', review.currentVersion).eq('status', 'failed'),
    );
  let failed = false;
  for await (const job of jobs) {
    const policy = await ctx.db
      .query('policies')
      .withIndex('by_owner_and_key', (q) => q.eq('owner', review.owner).eq('key', job.key))
      .unique();
    if (policy?.currentVersion === job.toVersion) {
      failed = true;
      break;
    }
  }
  await ctx.db.patch('reviews', review._id, { recheckFailed: failed });
}
