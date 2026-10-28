import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';

export async function ownedCampaign(ctx: QueryCtx, campaignId: Id<'campaigns'>, owner: string) {
  const campaign = await ctx.db.get('campaigns', campaignId);
  if (!campaign || campaign.owner !== owner) throw new ConvexError('Campaign not found.');
  return campaign;
}
function bucket(status: Doc<'reviews'>['status']) {
  return status === 'checking' || status === 'in_review' ? 'needs_review' : status;
}
export async function adjustCampaign(
  ctx: MutationCtx,
  campaignId: Id<'campaigns'> | undefined,
  owner: string,
  previous?: Doc<'reviews'>['status'],
  next?: Doc<'reviews'>['status'],
) {
  if (!campaignId) return;
  const campaign = await ownedCampaign(ctx, campaignId, owner);
  const counts = { ...campaign.counts };
  if (previous) {
    counts[bucket(previous)]--;
    counts.total--;
  }
  if (next) {
    counts[bucket(next)]++;
    counts.total++;
  }
  await ctx.db.patch('campaigns', campaignId, { counts, updatedAt: Date.now() });
}
export function validateContext(value: {
  name: string;
  offerTerms?: string;
  goLiveDate?: string;
  notes?: string;
}) {
  if (!value.name.trim() || value.name.trim().length > 160)
    throw new ConvexError('Enter a campaign name of 1 to 160 characters.');
  if ((value.offerTerms?.length ?? 0) > 10000 || (value.notes?.length ?? 0) > 10000)
    throw new ConvexError('Keep offer terms and notes under 10,000 characters.');
  if (
    value.goLiveDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value.goLiveDate) ||
      !Number.isFinite(Date.parse(value.goLiveDate)) ||
      new Date(value.goLiveDate).toISOString().slice(0, 10) !== value.goLiveDate)
  )
    throw new ConvexError('Use a valid YYYY-MM-DD go-live date.');
}
