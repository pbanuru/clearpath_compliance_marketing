import { v } from 'convex/values';
import type { QueryCtx } from '../_generated/server';
import { requireOwner } from '../assetAuth';
export const queueCounts = {
  args: {},
  returns: v.object({
    needs_review: v.number(),
    changes_requested: v.number(),
    approved: v.number(),
    all: v.number(),
  }),
  handler: async (ctx: QueryCtx) => {
    const owner = await requireOwner(ctx);
    const value = await ctx.db
      .query('reviewCounts')
      .withIndex('by_owner', (q) => q.eq('owner', owner))
      .unique();
    return {
      needs_review: value?.needs_review ?? 0,
      changes_requested: value?.changes_requested ?? 0,
      approved: value?.approvedHistory ?? value?.approved ?? 0,
      all: value?.all ?? 0,
    };
  },
};
