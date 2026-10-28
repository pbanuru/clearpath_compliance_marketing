import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from '../_generated/server';
import { requireOwner } from '../assetAuth';
import schema from '../schema';
import { ownedReview } from './helpers';
import { cover } from './types';
import { queueCompare, queueRank } from './queueOrder';

export const queue = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    schema.doc('reviews').extend({
      cover: cover.extend({ text: v.optional(v.string()), pageCount: v.optional(v.number()) }),
    }),
  ),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const result = await ctx.db
      .query('reviews')
      .withIndex('by_owner_and_updatedAt', (q) => q.eq('owner', owner))
      .order('desc')
      .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (review) => {
        const asset = await ctx.db.get('assets', review.coverAssetId);
        if (!asset || asset.owner !== owner) throw new ConvexError('Cover asset not found.');
        const pageCount =
          'pageCount' in asset.content && typeof asset.content.pageCount === 'number'
            ? asset.content.pageCount
            : undefined;
        return {
          ...review,
          ruleChangeRecheck:
            review.ruleChangeRecheck || ('recheck' in review && Boolean(review.recheck)),
          cover: {
            kind: asset.kind,
            ...(pageCount === undefined ? {} : { pageCount }),
            name: asset.name,
            ...(asset.kind === 'text' ? { text: asset.content.text.slice(0, 1200) } : {}),
          },
        };
      }),
    );
    return { ...result, page };
  },
});

export const stats = query({
  args: {},
  returns: v.object({
    needsReview: v.union(v.number(), v.null()),
    medianFirstDecisionMs: v.union(v.number(), v.null()),
    decidedThisWeek: v.union(v.number(), v.null()),
    complete: v.boolean(),
  }),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const now = Date.now();
    const week = new Date(now);
    week.setUTCHours(0, 0, 0, 0);
    week.setUTCDate(week.getUTCDate() - ((week.getUTCDay() + 6) % 7));
    const [pending, decisions] = await Promise.all([
      ctx.db
        .query('reviews')
        .withIndex('by_owner_and_status_and_updatedAt', (q) =>
          q.eq('owner', owner).eq('status', 'in_review'),
        )
        .take(5001),
      ctx.db
        .query('decisions')
        .withIndex('by_owner_and_decidedAt', (q) =>
          q.eq('owner', owner).gte('decidedAt', now - 30 * 86400000),
        )
        .take(5001),
    ]);
    // Refuse a misleading partial statistic in an unusually large workspace.
    const complete = decisions.length <= 5000;
    const durations = (
      await Promise.all(
        [...new Set(decisions.map((d) => d.reviewId))].map(async (reviewId) => {
          const [review, first] = await Promise.all([
            ctx.db.get('reviews', reviewId),
            ctx.db
              .query('decisions')
              .withIndex('by_reviewId_and_version', (q) => q.eq('reviewId', reviewId))
              .order('asc')
              .first(),
          ]);
          return review?.owner === owner &&
            first?.owner === owner &&
            first.decidedAt >= now - 30 * 86400000
            ? Math.max(0, first.decidedAt - review.createdAt)
            : null;
        }),
      )
    )
      .filter((d): d is number => d !== null)
      .sort((a, b) => a - b);
    const mid = Math.floor(durations.length / 2);
    const median = durations.length
      ? durations.length % 2
        ? (durations[mid] ?? 0)
        : ((durations[mid - 1] ?? 0) + (durations[mid] ?? 0)) / 2
      : null;
    return {
      needsReview: pending.length <= 5000 ? pending.length : null,
      medianFirstDecisionMs: complete ? median : null,
      decidedThisWeek: complete
        ? decisions.filter((d) => d.decidedAt >= week.getTime()).length
        : null,
      complete: complete && pending.length <= 5000,
    };
  },
});

export const pin = mutation({
  args: { reviewId: v.id('reviews'), beforeId: v.optional(v.id('reviews')) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    if (review.status !== 'in_review')
      throw new ConvexError('Only items needing review can be reordered.');
    if (args.beforeId === args.reviewId) return null;
    const before = args.beforeId ? await ownedReview(ctx, args.beforeId, owner) : null;
    if (before && before.status !== 'in_review')
      throw new ConvexError('Reorder within Needs review.');
    const rows = await ctx.db
      .query('reviews')
      .withIndex('by_owner_and_status_and_updatedAt', (q) =>
        q.eq('owner', owner).eq('status', 'in_review'),
      )
      .take(5001);
    if (rows.length > 5000) throw new ConvexError('This queue is too large to reorder.');
    const ordered = rows.filter((r) => r._id !== review._id).sort(queueCompare);
    const index = before ? ordered.findIndex((r) => r._id === before._id) : 0;
    if (index < 0) throw new ConvexError('The target moved. Try again.');
    const next = ordered[index];
    const previous = ordered[index - 1];
    const rank = next
      ? previous
        ? (queueRank(previous) + queueRank(next)) / 2
        : queueRank(next) - 1024
      : queueRank(review);
    if ((previous && rank <= queueRank(previous)) || (next && rank >= queueRank(next)))
      throw new ConvexError('These positions are too close. Unpin an item and try again.');
    await ctx.db.patch('reviews', review._id, { pinnedRank: rank });
    return null;
  },
});

export const unpin = mutation({
  args: { reviewId: v.id('reviews') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    await ctx.db.patch('reviews', review._id, { pinnedRank: undefined });
    return null;
  },
});
