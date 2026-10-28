import { v } from 'convex/values';
import { api } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { action, query } from './_generated/server';
import { requireOwner } from './assetAuth';
import schema from './schema';
import { quickContext } from './review/quickCheckTypes';
import { runQuickCheck } from './review/quickCheckRun';
import { matches } from './policy/library';

export const forAssets = action({
  args: quickContext.fields,
  returns: schema.doc('quickChecks'),
  handler: async (ctx, args): Promise<Doc<'quickChecks'>> => {
    const owner = await requireOwner(ctx);
    await ctx.runMutation(api.policies.initialize, {});
    const library = (await ctx.runQuery(api.policies.list, {})).filter((p) => matches(p, args));
    return runQuickCheck(ctx, owner, args, undefined, library);
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
