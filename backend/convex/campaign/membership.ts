import { v } from 'convex/values';
import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { requireOwner } from '../assetAuth';
import { ownedReview } from '../review/helpers';
import { adjustCampaign, ownedCampaign } from './helpers';

export const membership = {
  args: { reviewId: v.id('reviews'), campaignId: v.optional(v.id('campaigns')) },
  returns: v.null(),
  handler: async (
    ctx: MutationCtx,
    args: { reviewId: Id<'reviews'>; campaignId?: Id<'campaigns'> },
  ) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    if (args.campaignId) await ownedCampaign(ctx, args.campaignId, owner);
    if (review.campaignId === args.campaignId) return null;
    await adjustCampaign(ctx, review.campaignId, owner, review.status);
    await adjustCampaign(ctx, args.campaignId, owner, undefined, review.status);
    await ctx.db.patch('reviews', review._id, {
      campaignId: args.campaignId,
      updatedAt: Date.now(),
    });
    return null;
  },
};
