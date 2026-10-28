import { v } from 'convex/values';
import { query } from './_generated/server';
import { requireOwner } from './assetAuth';
import { policies, policy } from './review/policies';

export const list = query({
  args: {},
  returns: v.array(policy),
  handler: async (ctx) => {
    await requireOwner(ctx);
    return policies.map((p) => ({ ...p }));
  },
});
