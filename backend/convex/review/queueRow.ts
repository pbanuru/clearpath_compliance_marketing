import { ConvexError, v } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import schema from '../schema';
import { cover } from './types';
import { ownedCampaign } from '../campaign/helpers';

export const queueRow = schema.doc('reviews').extend({
  cover,
  campaignName: v.optional(v.string()),
});
export async function toQueueRow(ctx: QueryCtx, review: Doc<'reviews'>) {
  const asset = await ctx.db.get('assets', review.coverAssetId);
  if (!asset || asset.owner !== review.owner) throw new ConvexError('Cover asset not found.');
  const campaign = review.campaignId
    ? await ownedCampaign(ctx, review.campaignId, review.owner)
    : undefined;
  return { ...review, cover: { kind: asset.kind, name: asset.name }, campaignName: campaign?.name };
}
