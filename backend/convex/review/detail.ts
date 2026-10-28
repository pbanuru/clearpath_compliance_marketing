import { ConvexError, v } from 'convex/values';
import type { QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { requireOwner } from '../assetAuth';
import schema from '../schema';
import { ownedReview } from './helpers';

export const detail = {
  args: { reviewId: v.id('reviews') },
  returns: v.object({
    review: schema.doc('reviews'),
    versions: v.array(
      schema.doc('reviewVersions').extend({ assets: v.array(schema.doc('assets')) }),
    ),
    findings: v.array(schema.doc('findings')),
    decisions: v.array(schema.doc('decisions')),
    events: v.array(schema.doc('reviewEvents')),
    cost: v.object({ knownUsd: v.number(), unknownCalls: v.number(), spans: v.number() }),
  }),
  handler: async (ctx: QueryCtx, args: { reviewId: Id<'reviews'> }) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    const versions = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_number', (q) => q.eq('reviewId', review._id))
      .take(100);
    const withAssets = await Promise.all(
      versions.map(async (version) => {
        const assets = [];
        for (const id of version.assetIds) {
          const asset = await ctx.db.get('assets', id);
          if (!asset || asset.owner !== owner) throw new ConvexError('Asset not found.');
          assets.push(asset);
        }
        return { ...version, assets };
      }),
    );
    const findings = await ctx.db
      .query('findings')
      .withIndex('by_reviewId_and_version', (q) => q.eq('reviewId', review._id))
      .take(10000);
    const decisions = await ctx.db
      .query('decisions')
      .withIndex('by_reviewId_and_version', (q) => q.eq('reviewId', review._id))
      .take(100);
    const events = await ctx.db
      .query('reviewEvents')
      .withIndex('by_reviewId_and_at', (q) => q.eq('reviewId', review._id))
      .take(8000);
    const spans = await ctx.db
      .query('aiSpans')
      .withIndex('by_reviewId_and_version', (q) => q.eq('reviewId', review._id))
      .take(8000);
    return {
      review,
      versions: withAssets,
      findings: findings.filter((f) => f.owner === owner),
      decisions: decisions.filter((d) => d.owner === owner),
      events: events.filter((e) => e.owner === owner),
      cost: {
        knownUsd: spans.reduce((sum, s) => sum + (s.costUsd ?? 0), 0),
        unknownCalls: spans.filter((s) => s.costUsd === null).length,
        spans: spans.length,
      },
    };
  },
};
