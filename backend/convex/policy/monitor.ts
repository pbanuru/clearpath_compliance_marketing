import { v } from 'convex/values';
import { action, internalAction } from '../_generated/server';
import { internal } from '../_generated/api';
import { requireOwner } from '../assetAuth';
import type { Id } from '../_generated/dataModel';
export const checkNow = action({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    await requireOwner(ctx);
    const id: Id<'sourceRuns'> | null = await ctx.runMutation(
      internal.policy.monitorState.begin,
      {},
    );
    if (!id) return false;
    await ctx.scheduler.runAfter(0, internal.policy.dailyPlanning.plan, { id });
    return true;
  },
});
export const run = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const id: Id<'sourceRuns'> | null = await ctx.runMutation(
      internal.policy.monitorState.begin,
      {},
    );
    if (id) await ctx.runMutation(internal.policy.dailyPlanning.plan, { id });
    return null;
  },
});
