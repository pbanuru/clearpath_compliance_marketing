import { v } from 'convex/values';
import { internalAction, internalMutation, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import { citation } from './tables';
import schema from '../schema';
import { retrieveCitation } from './citationText';
const args = { id: v.id('policyVersions'), url: v.string(), expectedStart: v.optional(v.string()) };
export const load = internalQuery({
  args: { id: v.id('policyVersions') },
  returns: v.union(v.null(), schema.doc('policyVersions')),
  handler: (ctx, { id }) => ctx.db.get('policyVersions', id),
});
export const save = internalMutation({
  args: {
    id: v.id('policyVersions'),
    citation: v.optional(citation),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { id, citation, error }) => {
    const row = await ctx.db.get('policyVersions', id);
    if (row && !row.citation)
      await ctx.db.patch('policyVersions', id, { citation, citationError: error });
    return null;
  },
});
export const retrieve = internalAction({
  args,
  returns: v.null(),
  handler: async (ctx, { id, url, expectedStart }) => {
    const row = await ctx.runQuery(internal.policy.citations.load, { id });
    if (!row || row.citation) return null;
    try {
      await ctx.runMutation(internal.policy.citations.save, {
        id,
        citation: await retrieveCitation(url, row.check, expectedStart),
      });
    } catch (error) {
      await ctx.runMutation(internal.policy.citations.save, {
        id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  },
});
