import type { MutationCtx } from '../_generated/server';
import { emptyCounts } from './model';

export async function exampleCampaign(ctx: MutationCtx, owner: string, example?: string) {
  if (example !== 'personal-loan-social' && example !== 'affiliate-video') return undefined;
  const name = 'Example campaign: Personal loan spring promo';
  const existing = await ctx.db
    .query('campaigns')
    .withIndex('by_owner_and_name', (q) => q.eq('owner', owner).eq('name', name))
    .first();
  if (existing) return existing._id;
  const now = Date.now();
  return await ctx.db.insert('campaigns', {
    owner,
    name,
    product: 'personal_loan',
    offerTerms: 'APR 5.99%–35.99%; loans $2,000–$50,000; terms 24–60 months.',
    notes: 'Social ad and affiliate video for the personal loan spring promotion.',
    counts: emptyCounts,
    createdAt: now,
    updatedAt: now,
  });
}
