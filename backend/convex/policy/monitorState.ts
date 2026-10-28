import { v } from 'convex/values';
import { internalMutation, internalQuery, query } from '../_generated/server';
import { internal } from '../_generated/api';
import schema from '../schema';
import { requireOwner } from '../assetAuth';
import { sourceKey } from './library';

export const latest = query({
  args: {},
  returns: v.object({
    last: v.union(v.null(), schema.doc('sourceRuns')),
    completedAt: v.union(v.number(), v.null()),
  }),
  handler: async (ctx) => {
    await requireOwner(ctx);
    const runs = await ctx.db
      .query('sourceRuns')
      .withIndex('by_key', (q) => q.eq('key', 'daily'))
      .order('desc')
      .take(30);
    return {
      last: runs[0] ?? null,
      completedAt: runs.find((r) => r.finishedAt)?.finishedAt ?? null,
    };
  },
});
export const begin = internalMutation({
  args: {},
  returns: v.union(v.null(), v.id('sourceRuns')),
  handler: async (ctx) => {
    const last = await ctx.db
      .query('sourceRuns')
      .withIndex('by_key', (q) => q.eq('key', 'daily'))
      .order('desc')
      .first();
    if (last && Date.now() - last.startedAt < (last.status === 'running' ? 35 : 10) * 60000)
      return null;
    return ctx.db.insert('sourceRuns', {
      key: 'daily',
      startedAt: Date.now(),
      status: 'running',
      errors: [],
      checked: 0,
      updates: 0,
    });
  },
});
export const unseen = internalQuery({
  args: { sourceKey: v.string(), urls: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const result = [];
    for (const url of args.urls)
      if (
        !(await ctx.db
          .query('sourceSeen')
          .withIndex('by_sourceKey_and_url', (q) =>
            q.eq('sourceKey', args.sourceKey).eq('url', url),
          )
          .unique())
      )
        result.push(url);
    return result;
  },
});
export const fanout = internalMutation({
  args: { signalId: v.id('sourceSignals'), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const signal = await ctx.db.get('sourceSignals', args.signalId);
    if (!signal) return null;
    const owners = await ctx.db
      .query('workspaceSources')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', signal.sourceKey))
      .paginate({ numItems: 25, cursor: args.cursor });
    for (const subscription of owners.page) {
      if (subscription.paused) continue;
      for (const sourceDraft of signal.drafts) {
        const { owners, ...d } = sourceDraft;
        if (owners && !owners.includes(subscription.owner)) continue;
        const key = d.key;
        if (d.key && subscription.linkedRules.length && !subscription.linkedRules.includes(d.key))
          continue;
        if (
          d.key &&
          !(await ctx.db
            .query('policies')
            .withIndex('by_owner_and_key', (q) =>
              q.eq('owner', subscription.owner).eq('key', key ?? ''),
            )
            .unique())
        )
          continue;
        const fingerprint = `${signal.fingerprint}:${d.key ?? 'new'}`;
        const old = await ctx.db
          .query('policyUpdates')
          .withIndex('by_owner_and_fingerprint', (q) =>
            q.eq('owner', subscription.owner).eq('fingerprint', fingerprint),
          )
          .unique();
        if (!old)
          await ctx.db.insert('policyUpdates', {
            owner: subscription.owner,
            sourceKey: signal.sourceKey,
            fingerprint,
            detectedAt: signal.detectedAt,
            ...d,
            jurisdiction: subscription.jurisdiction,
            status: d.triageError ? 'not_triaged' : 'open',
          });
      }
    }
    if (!owners.isDone)
      await ctx.scheduler.runAfter(0, internal.policy.monitorState.fanout, {
        signalId: args.signalId,
        cursor: owners.continueCursor,
      });
    return null;
  },
});
export const badges = query({
  args: {},
  returns: v.object({ open: v.number(), failing: v.number() }),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    let open = 0,
      failing = 0;
    for (const status of ['open', 'not_triaged'] as const)
      open += (
        await ctx.db
          .query('policyUpdates')
          .withIndex('by_owner_and_status', (q) => q.eq('owner', owner).eq('status', status))
          .take(250)
      ).length;
    const sources = await ctx.db
      .query('workspaceSources')
      .withIndex('by_owner_and_sourceKey', (q) => q.eq('owner', owner))
      .take(250);
    for (const s of sources)
      if (!s.paused) {
        const global = await ctx.db
          .query('sourceChecks')
          .withIndex('by_sourceKey', (q) => q.eq('sourceKey', s.sourceKey))
          .unique();
        if (global?.lastError) failing++;
      }
    return { open, failing };
  },
});
export const checked = internalMutation({
  args: { sourceKey: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owners = await ctx.db
      .query('workspaceSources')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', args.sourceKey))
      .paginate({ numItems: 25, cursor: args.cursor });
    for (const s of owners.page)
      if (!s.paused) {
        const policies = await ctx.db
          .query('policies')
          .withIndex('by_owner_and_key', (q) => q.eq('owner', s.owner))
          .take(250);
        for (const p of policies)
          if (sourceKey(p.source.monitor) === args.sourceKey || s.linkedRules.includes(p.key))
            await ctx.db.patch('policies', p._id, { lastCheckedAt: Date.now() });
      }
    if (!owners.isDone)
      await ctx.scheduler.runAfter(0, internal.policy.monitorState.checked, {
        sourceKey: args.sourceKey,
        cursor: owners.continueCursor,
      });
    return null;
  },
});
