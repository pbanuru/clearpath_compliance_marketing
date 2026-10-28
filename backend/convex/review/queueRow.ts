import { ConvexError, v } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { QueryCtx } from '../_generated/server';
import schema from '../schema';
import { cover } from './types';
import { ownedCampaign } from '../campaign/helpers';
import { currentVersion } from './helpers';
import { risk } from './quickCheckLogic';
import { quickRisk } from './quickCheckTypes';

export const queueRow = schema.doc('reviews').extend({
  cover,
  quickRisk: v.union(quickRisk, v.null()),
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
  const [{ asset, campaignName }, version] = await Promise.all([
    material(ctx, review),
    currentVersion(ctx, review),
  ]);
  return {
    ...review,
    cover: { kind: asset.kind, name: asset.name },
    campaignName,
    quickRisk: await versionRisk(ctx, review, version),
  };
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
    quickRisk: await versionRisk(ctx, review, version),
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

async function versionRisk(ctx: QueryCtx, review: Doc<'reviews'>, version: Doc<'reviewVersions'>) {
  const check = version.quickCheckId ? await ctx.db.get('quickChecks', version.quickCheckId) : null;
  return check?.owner === review.owner && check.status === 'succeeded' ? risk(check.rules) : null;
}
