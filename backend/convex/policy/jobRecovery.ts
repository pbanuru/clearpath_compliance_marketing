import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
export const source = internalMutation({
  args: { jobId: v.id('sourceJobs'), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get('sourceJobs', args.jobId);
    if (job?.status === 'running' && job.attempts === args.attempt)
      await ctx.runMutation(internal.policy.sourceJobs.finish, {
        ...args,
        urls: [],
        signals: [],
        spans: [],
        error: 'Source check interrupted or timed out before saving a result.',
        transient: true,
      });
    return null;
  },
});
export const recheck = internalMutation({
  args: { id: v.id('policyRechecks'), runKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get('policyRechecks', args.id);
    if (job?.status === 'running' && job.runKey === args.runKey)
      await ctx.runMutation(internal.policy.recheckState.finish, {
        ...args,
        result: null,
        spans: [],
        error: 'Recheck interrupted or timed out before saving a result. Retry the recheck.',
      });
    return null;
  },
});
