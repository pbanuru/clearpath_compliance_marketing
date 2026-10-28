import { ConvexError, v } from 'convex/values';
import type { QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { requireOwner } from '../assetAuth';
import schema from '../schema';
import { ownedReview } from './helpers';

export const detail = {
  args: { reviewId: v.id('reviews') },
  returns: v.object({
    review: schema.doc('reviews'),
    versions: v.array(
      schema.doc('reviewVersions').extend({
        assets: v.array(schema.doc('assets')),
        quickCheck: v.union(schema.doc('quickChecks'), v.null()),
      }),
    ),
    findings: v.array(schema.doc('findings')),
    decisions: v.array(schema.doc('decisions')),
    events: v.array(schema.doc('reviewEvents')),
    transcripts: v.array(schema.doc('assetExtractions').pick('assetId', 'status', 'segments')),
    cost: v.object({ knownUsd: v.number(), unknownCalls: v.number(), spans: v.number() }),
  }),
  handler: async (ctx: QueryCtx, args: { reviewId: Id<'reviews'> }) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    const versions = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_number', (q) => q.eq('reviewId', review._id))
      .take(100);
    const transcripts: Pick<Doc<'assetExtractions'>, 'assetId' | 'status' | 'segments'>[] = [];
    const seen = new Set<string>();
    const withAssets = await Promise.all(
      versions.map(async (version) => {
        const assets = [];
        for (const id of version.assetIds) {
          const asset = await ctx.db.get('assets', id);
          if (!asset || asset.owner !== owner) throw new ConvexError('Asset not found.');
          assets.push(asset);
          if ((asset.kind === 'audio' || asset.kind === 'video') && !seen.has(asset._id)) {
            seen.add(asset._id);
            const extraction = await ctx.db
              .query('assetExtractions')
              .withIndex('by_assetId_and_kind', (q) =>
                q.eq('assetId', asset._id).eq('kind', 'transcript'),
              )
              .unique();
            if (extraction?.owner === owner)
              transcripts.push({
                assetId: extraction.assetId,
                status: extraction.status,
                segments: extraction.segments,
              });
          }
        }
        const check = version.quickCheckId
          ? await ctx.db.get('quickChecks', version.quickCheckId)
          : null;
        return { ...version, assets, quickCheck: check?.owner === owner ? check : null };
      }),
    );
    const findings = await ctx.db
      .query('findings')
      .withIndex('by_reviewId_and_version', (q) => q.eq('reviewId', review._id))
      .collect();
    const decisions = await ctx.db
      .query('decisions')
      .withIndex('by_reviewId_and_version', (q) => q.eq('reviewId', review._id))
      .take(100);
    const events = await ctx.db
      .query('reviewEvents')
      .withIndex('by_reviewId_and_at', (q) => q.eq('reviewId', review._id))
      .collect();
    const cost = await ctx.db
      .query('reviewCosts')
      .withIndex('by_reviewId', (q) => q.eq('reviewId', review._id))
      .unique();
    if (cost && cost.owner !== owner) throw new ConvexError('Cost record not found.');
    return {
      review,
      transcripts,
      versions: withAssets,
      findings: findings.filter((f) => f.owner === owner),
      decisions: decisions.filter((d) => d.owner === owner),
      events: events.filter((e) => e.owner === owner),
      cost: {
        knownUsd: cost?.knownUsd ?? 0,
        unknownCalls: cost?.unknownCalls ?? 0,
        spans: cost?.spans ?? 0,
      },
    };
  },
};
