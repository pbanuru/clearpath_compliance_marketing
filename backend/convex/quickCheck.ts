import { v } from 'convex/values';
import { action, query } from './_generated/server';
import { requireOwner } from './assetAuth';
import schema from './schema';
import { quickContext } from './review/quickCheckTypes';
import { runQuickCheck } from './review/quickCheckRun';

export const forAssets = action({
  args: quickContext.fields,
  returns: schema.doc('quickChecks'),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    return runQuickCheck(ctx, owner, args);
  },
});
export const get = query({
  args: { id: v.id('quickChecks') },
  returns: v.union(schema.doc('quickChecks'), v.null()),
  handler: async (ctx, { id }) => {
    const owner = await requireOwner(ctx);
    const check = await ctx.db.get('quickChecks', id);
    return check?.owner === owner ? check : null;
  },
});
