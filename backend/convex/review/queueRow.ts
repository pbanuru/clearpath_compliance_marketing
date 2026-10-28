import { ConvexError, v } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import schema from '../schema';
import { cover } from './types';
import { ownedCampaign } from '../campaign/helpers';
import { currentVersion } from './helpers';

export const queueRow = schema.doc('reviews').extend({
  cover,
  campaignName: v.optional(v.string()),
});
export const queueItem = queueRow.extend({
  analysisFailed: v.boolean(),
  cover: cover.extend({ text: v.optional(v.string()), pageCount: v.optional(v.number()) }),
});
async function material(ctx: QueryCtx, review: Doc<'reviews'>) {
  const asset = await ctx.db.get('assets', review.coverAssetId);
  if (!asset || asset.owner !== review.owner) throw new ConvexError('Cover asset not found.');
  const campaign = review.campaignId
    ? await ownedCampaign(ctx, review.campaignId, review.owner)
    : undefined;
  return { asset, campaignName: campaign?.name };
}
export async function toQueueRow(ctx: QueryCtx, review: Doc<'reviews'>) {
  const { asset, campaignName } = await material(ctx, review);
  return { ...review, cover: { kind: asset.kind, name: asset.name }, campaignName };
}
export async function toQueueItem(ctx: QueryCtx, review: Doc<'reviews'>) {
  const [{ asset, campaignName }, version] = await Promise.all([
    material(ctx, review),
    currentVersion(ctx, review),
  ]);
  const pageCount =
    'pageCount' in asset.content && typeof asset.content.pageCount === 'number'
      ? asset.content.pageCount
      : undefined;
  return {
    ...review,
    campaignName,
    analysisFailed: version.analysis.status === 'failed',
    ruleChangeRecheck: review.ruleChangeRecheck || ('recheck' in review && Boolean(review.recheck)),
    cover: {
      kind: asset.kind,
      name: asset.name,
      ...(pageCount === undefined ? {} : { pageCount }),
      ...(asset.kind === 'text' ? { text: asset.content.text.slice(0, 1200) } : {}),
    },
  };
}
