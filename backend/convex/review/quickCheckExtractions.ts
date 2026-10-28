import { v } from 'convex/values';
import { internalQuery } from '../_generated/server';
import schema from '../schema';

export const forAssets = internalQuery({
  args: { owner: v.string(), assetIds: v.array(v.id('assets')) },
  returns: v.array(schema.doc('assetExtractions')),
  handler: async (ctx, args) => {
    const extractions = [];
    for (const id of args.assetIds) {
      const extraction = await ctx.db
        .query('assetExtractions')
        .withIndex('by_assetId_and_kind', (q) => q.eq('assetId', id).eq('kind', 'transcript'))
        .unique();
      if (extraction?.owner === args.owner && extraction.status === 'succeeded')
        extractions.push(extraction);
    }
    return extractions;
  },
});
