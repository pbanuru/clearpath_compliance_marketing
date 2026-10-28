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
      analysisFailed: v.boolean(),
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
        const [asset, version] = await Promise.all([
          ctx.db.get('assets', review.coverAssetId),
          ctx.db
            .query('reviewVersions')
            .withIndex('by_reviewId_and_number', (q) =>
              q.eq('reviewId', review._id).eq('number', review.currentVersion),
            )
            .unique(),
        ]);
        if (!version || version.owner !== owner) throw new ConvexError('Review version not found.');
        if (!asset || asset.owner !== owner) throw new ConvexError('Cover asset not found.');
        const pageCount =
          'pageCount' in asset.content && typeof asset.content.pageCount === 'number'
            ? asset.content.pageCount
            : undefined;
        return {
          ...review,
          analysisFailed: version.analysis.status === 'failed',
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

export const pin = mutation({
  args: {
    reviewId: v.id('reviews'),
    beforeId: v.optional(v.id('reviews')),
    sort: v.optional(v.union(v.literal('go_live'), v.literal('waiting'))),
  },
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
    const sort = args.sort ?? rows.find((r) => r.pinnedRank !== undefined)?.pinnedSort ?? 'go_live';
    const ordered = rows
      .filter((r) => r._id !== review._id)
      .map((r) => (args.sort ? { ...r, pinnedRank: undefined } : r))
      .sort((a, b) => queueCompare(a, b, sort));
    const index = before ? ordered.findIndex((r) => r._id === before._id) : 0;
    if (index < 0) throw new ConvexError('The target moved. Try again.');
    const next = ordered[index];
    const previous = ordered[index - 1];
    const rank = next
      ? previous
        ? (queueRank(previous, sort) + queueRank(next, sort)) / 2
        : queueRank(next, sort) - 1024
      : queueRank({ ...review, pinnedRank: undefined }, sort);
    if ((previous && rank <= queueRank(previous, sort)) || (next && rank >= queueRank(next, sort)))
      throw new ConvexError('These positions are too close. Unpin an item and try again.');
    // A drag from an automatic sort starts a manual order from exactly that visible order.
    if (args.sort)
      for (const row of rows)
        if (row.pinnedRank !== undefined)
          await ctx.db.patch('reviews', row._id, { pinnedRank: undefined, pinnedSort: undefined });
    await ctx.db.patch('reviews', review._id, { pinnedRank: rank, pinnedSort: sort });
    return null;
  },
});

export const unpin = mutation({
  args: { reviewId: v.id('reviews') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    await ctx.db.patch('reviews', review._id, { pinnedRank: undefined, pinnedSort: undefined });
    return null;
  },
});

export const resetOrder = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const rows = await ctx.db
      .query('reviews')
      .withIndex('by_owner_and_status_and_updatedAt', (q) =>
        q.eq('owner', owner).eq('status', 'in_review'),
      )
      .take(5001);
    if (rows.length > 5000) throw new ConvexError('This queue is too large to reorder.');
    for (const review of rows)
      if (review.pinnedRank !== undefined)
        await ctx.db.patch('reviews', review._id, { pinnedRank: undefined, pinnedSort: undefined });
    return null;
  },
});
