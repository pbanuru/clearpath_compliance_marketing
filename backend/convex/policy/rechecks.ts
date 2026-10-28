import { v } from 'convex/values';
import { query, mutation } from '../_generated/server';
import { requireOwner } from '../assetAuth';
import { ownedReview, event } from '../review/helpers';
import schema from '../schema';
export const list = query({
  args: { key: v.string(), toVersion: v.number() },
  returns: v.array(schema.doc('policyRechecks')),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    return ctx.db
      .query('policyRechecks')
      .withIndex('by_owner_and_key_and_toVersion', (q) =>
        q.eq('owner', owner).eq('key', args.key).eq('toVersion', args.toVersion),
      )
      .take(500);
  },
});
export const setUsage = mutation({
  args: {
    reviewId: v.id('reviews'),
    usage: v.union(v.literal('unknown'), v.literal('live'), v.literal('retired')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx),
      r = await ownedReview(ctx, args.reviewId, owner);
    if (r.status !== 'approved') throw new Error('Usage is set on approved material.');
    await ctx.db.patch('reviews', r._id, { usage: args.usage });
    await event(ctx, r, 'usage_changed', `In use: ${args.usage}`);
    return null;
  },
});

export const count = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const row = await ctx.db
      .query('reviewCounts')
      .withIndex('by_owner', (q) => q.eq('owner', owner))
      .unique();
    return row?.rechecks ?? 0;
  },
});
