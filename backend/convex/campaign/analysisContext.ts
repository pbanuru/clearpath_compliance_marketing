import { v } from 'convex/values';
import type { QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { channel } from '../review/types';
import { ownedCampaign } from './helpers';

export const campaignContext = v.union(
  v.null(),
  v.object({
    name: v.string(),
    offerTerms: v.optional(v.string()),
    notes: v.optional(v.string()),
    relatedMaterial: v.array(v.object({ title: v.string(), channel })),
    relatedMaterialTruncated: v.boolean(),
  }),
);
export async function analysisCampaign(ctx: QueryCtx, review: Doc<'reviews'>) {
  if (!review.campaignId) return null;
  const campaign = await ownedCampaign(ctx, review.campaignId, review.owner);
  const related = await ctx.db
    .query('reviews')
    .withIndex('by_owner_and_campaignId_and_updatedAt', (q) =>
      q.eq('owner', review.owner).eq('campaignId', campaign._id),
    )
    .order('desc')
    .take(102);
  const others = related.filter((row) => row._id !== review._id);
  return {
    name: campaign.name,
    offerTerms: campaign.offerTerms,
    notes: campaign.notes,
    relatedMaterial: others.slice(0, 100).map(({ title, channel }) => ({ title, channel })),
    relatedMaterialTruncated: others.length > 100,
  };
}
