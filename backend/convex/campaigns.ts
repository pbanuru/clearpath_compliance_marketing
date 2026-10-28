import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwner } from './assetAuth';
import schema from './schema';
import { contextFields, emptyCounts, statusCounts } from './campaign/model';
import { ownedCampaign, validateContext } from './campaign/helpers';
import { queueItem, toQueueItem } from './review/queueRow';

export const create = mutation({
  args: contextFields,
  returns: v.id('campaigns'),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    validateContext(args);
    const now = Date.now();
    return await ctx.db.insert('campaigns', {
      ...args,
      name: args.name.trim(),
      owner,
      counts: emptyCounts,
      createdAt: now,
      updatedAt: now,
    });
  },
});
export const update = mutation({
  args: { campaignId: v.id('campaigns'), ...contextFields },
  returns: v.null(),
  handler: async (ctx, { campaignId, ...context }) => {
    const owner = await requireOwner(ctx);
    await ownedCampaign(ctx, campaignId, owner);
    validateContext(context);
    await ctx.db.patch('campaigns', campaignId, {
      ...context,
      name: context.name.trim(),
      updatedAt: Date.now(),
      product: context.product,
      offerTerms: context.offerTerms,
      goLiveDate: context.goLiveDate,
      notes: context.notes,
    });
    return null;
  },
});
export const list = query({
  args: { paginationOpts: paginationOptsValidator, search: v.optional(v.string()) },
  returns: paginationResultValidator(schema.doc('campaigns')),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const search = args.search?.trim();
    return search
      ? await ctx.db
          .query('campaigns')
          .withSearchIndex('search_name', (q) => q.search('name', search).eq('owner', owner))
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('campaigns')
          .withIndex('by_owner_and_updatedAt', (q) => q.eq('owner', owner))
          .order('desc')
          .paginate(args.paginationOpts);
  },
});
export const get = query({
  args: { campaignId: v.id('campaigns'), paginationOpts: paginationOptsValidator },
  returns: v.object({
    campaign: schema.doc('campaigns'),
    counts: statusCounts,
    submissions: paginationResultValidator(queueItem),
  }),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const campaign = await ownedCampaign(ctx, args.campaignId, owner);
    const result = await ctx.db
      .query('reviews')
      .withIndex('by_owner_and_campaignId_and_updatedAt', (q) =>
        q.eq('owner', owner).eq('campaignId', args.campaignId),
      )
      .order('desc')
      .paginate(args.paginationOpts);
    const page = await Promise.all(result.page.map((review) => toQueueItem(ctx, review)));
    return { campaign, counts: campaign.counts, submissions: { ...result, page } };
  },
});
