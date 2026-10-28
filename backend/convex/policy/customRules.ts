import { v } from 'convex/values';
import { mutation } from '../_generated/server';
import { requireOwner } from '../assetAuth';
import { ensurePolicies } from './library';
import { validateText } from './changes';
import { policy } from '../review/policies';
import { httpUrl } from './urls';
import { internal } from '../_generated/api';
export const add = mutation({
  args: {
    title: v.string(),
    kind: v.union(v.literal('clearpath_standard'), v.literal('state_rule')),
    jurisdiction: v.string(),
    appliesTo: policy.fields.appliesTo,
    check: v.string(),
    sourceUrl: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await ensurePolicies(ctx, owner);
    if (!args.title.trim() || args.title.length > 200)
      throw new Error('Enter a rule title up to 200 characters.');
    if (args.kind === 'state_rule' && !/^[A-Z]{2}$/.test(args.jurisdiction))
      throw new Error('Choose a two-letter state jurisdiction.');
    validateText(args.check, 'Reviewer-written rule.');
    const count = await ctx.db
      .query('policies')
      .withIndex('by_owner_and_key', (q) => q.eq('owner', owner))
      .take(250);
    if (count.length >= 250) throw new Error('This workspace supports up to 250 rules.');
    const key = `custom-${crypto.randomUUID()}`,
      now = Date.now();
    await ctx.db.insert('policies', {
      owner,
      key,
      kind: args.kind,
      jurisdiction: args.jurisdiction,
      currentVersion: 1,
      source: {
        label: args.sourceUrl ? 'Reviewer-provided source' : 'ClearPath standard',
        url: args.sourceUrl ? httpUrl(args.sourceUrl) : null,
        monitor: { type: 'internal' },
      },
      lastChangedAt: now,
    });
    const versionId = await ctx.db.insert('policyVersions', {
      owner,
      key,
      version: 1,
      title: args.title.trim(),
      appliesTo: args.appliesTo,
      jurisdiction: args.jurisdiction,
      check: args.check.trim(),
      changeSummary: 'Reviewer-written rule.',
      createdBy: 'reviewer',
      createdAt: now,
    });
    if (args.kind === 'state_rule' && args.sourceUrl)
      await ctx.scheduler.runAfter(0, internal.policy.citations.retrieve, {
        id: versionId,
        url: httpUrl(args.sourceUrl),
      });
    return key;
  },
});
