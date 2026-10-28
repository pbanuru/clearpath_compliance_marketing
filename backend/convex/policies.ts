import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { requireOwner } from './assetAuth';
import { policies as seeds, policy } from './review/policies';
import { currentPolicies, ensurePolicies, seedMonitor, subscribe } from './policy/library';
import { source } from './policy/tables';
import {
  candidates,
  createVersion,
  policyByKey,
  policyVersion,
  validateText,
} from './policy/changes';
import schema from './schema';
import { upgradeApprovals } from './policy/upgradeApprovals';

export const initialize = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    await ensurePolicies(ctx, owner);
    await upgradeApprovals(ctx, owner);
    return null;
  },
});
export const list = query({
  args: {},
  returns: v.array(
    policy.extend({
      key: v.string(),
      source,
      currentVersion: v.number(),
      lastCheckedAt: v.optional(v.number()),
      lastChangedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const rows = await currentPolicies(ctx, owner);
    if (!rows.length)
      return seeds.map((p) => ({
        ...p,
        key: p.id,
        source: { ...p.source, monitor: seedMonitor(p) },
        currentVersion: 1,
        lastCheckedAt: undefined,
        lastChangedAt: 0,
      }));
    return rows.map((p) => ({
      id: p.key,
      key: p.key,
      title: p.title,
      kind: p.kind,
      appliesTo: p.appliesTo,
      check: p.check,
      jurisdiction: p.jurisdiction,
      source: p.source,
      currentVersion: p.currentVersion,
      lastCheckedAt: p.lastCheckedAt,
      lastChangedAt: p.lastChangedAt,
    }));
  },
});
export const history = query({
  args: { key: v.string() },
  returns: v.array(schema.doc('policyVersions')),
  handler: async (ctx, { key }) => {
    const owner = await requireOwner(ctx);
    return ctx.db
      .query('policyVersions')
      .withIndex('by_owner_and_key_and_version', (q) => q.eq('owner', owner).eq('key', key))
      .order('desc')
      .take(100);
  },
});
export const updates = query({
  args: {},
  returns: v.array(schema.doc('policyUpdates')),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx),
      rows = [];
    for (const status of ['open', 'not_triaged', 'applied'] as const)
      rows.push(
        ...(await ctx.db
          .query('policyUpdates')
          .withIndex('by_owner_and_status', (q) => q.eq('owner', owner).eq('status', status))
          .order('desc')
          .take(100)),
      );
    return rows;
  },
});
export const preview = query({
  args: { key: v.optional(v.string()), updateId: v.optional(v.id('policyUpdates')) },
  returns: v.number(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    if (args.updateId) {
      const u = await ctx.db.get('policyUpdates', args.updateId);
      if (!u || u.owner !== owner) throw new ConvexError('Update not found.');
      const appliesTo = u.key
        ? (await policyVersion(ctx, await policyByKey(ctx, owner, u.key))).appliesTo
        : u.appliesTo;
      return (await candidates(ctx, owner, appliesTo, u.jurisdiction)).length;
    }
    const p = await policyByKey(ctx, owner, args.key ?? '');
    return (await candidates(ctx, owner, (await policyVersion(ctx, p)).appliesTo, p.jurisdiction))
      .length;
  },
});
export const edit = mutation({
  args: {
    key: v.string(),
    expectedVersion: v.number(),
    check: v.string(),
    changeSummary: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await ensurePolicies(ctx, owner);
    const p = await policyByKey(ctx, owner, args.key);
    if (p.source.monitor.type !== 'internal')
      throw new ConvexError('External rules change only through source updates.');
    if (p.currentVersion !== args.expectedVersion)
      throw new ConvexError('This policy changed. Reload before editing.');
    return createVersion(
      ctx,
      p,
      await policyVersion(ctx, p),
      args.check,
      args.changeSummary,
      'reviewer',
    );
  },
});
export const apply = mutation({
  args: { updateId: v.id('policyUpdates'), check: v.string(), expectedVersion: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const u = await ctx.db.get('policyUpdates', args.updateId);
    if (!u || u.owner !== owner || !['open', 'not_triaged'].includes(u.status))
      throw new ConvexError('Open update not found.');
    validateText(args.check, u.aiSummary);
    let count = 0;
    let appliedKey = u.key;
    if (u.key) {
      const p = await policyByKey(ctx, owner, u.key);
      if (p.currentVersion !== args.expectedVersion)
        throw new ConvexError('This policy changed. Review the latest version before applying.');
      count = await createVersion(
        ctx,
        p,
        await policyVersion(ctx, p),
        args.check,
        u.aiSummary,
        'source_update',
      );
    } else {
      const key = `new-${u._id}`;
      const pId = await ctx.db.insert('policies', {
        owner,
        key,
        kind: u.jurisdiction && u.jurisdiction !== 'federal' ? 'state_rule' : 'regulation',
        jurisdiction: u.jurisdiction,
        currentVersion: 0,
        source: {
          label: u.evidence.documentTitle ?? u.title,
          url: u.evidence.url,
          monitor: { type: 'page', url: u.evidence.url },
        },
        lastChangedAt: Date.now(),
      });
      const p = await ctx.db.get('policies', pId);
      if (!p) throw new Error('New policy was not saved.');
      count = await createVersion(
        ctx,
        p,
        {
          title: u.title,
          appliesTo: u.appliesTo,
          jurisdiction: u.jurisdiction,
          check: 'No previous library rule.',
        },
        args.check,
        u.aiSummary,
        'source_update',
      );
    }
    if (!u.key) {
      appliedKey = `new-${u._id}`;
      await subscribe(
        ctx,
        owner,
        { type: 'page', url: u.evidence.url },
        u.title,
        [appliedKey],
        undefined,
        u.jurisdiction ?? 'federal',
      );
    }
    await ctx.db.patch('policyUpdates', u._id, {
      status: 'applied',
      appliedKey: appliedKey ?? undefined,
      appliedVersion: u.key ? (await policyByKey(ctx, owner, u.key)).currentVersion : 1,
    });
    return count;
  },
});
export const dismiss = mutation({
  args: { updateId: v.id('policyUpdates') },
  returns: v.null(),
  handler: async (ctx, { updateId }) => {
    const owner = await requireOwner(ctx),
      u = await ctx.db.get('policyUpdates', updateId);
    if (!u || u.owner !== owner || !['open', 'not_triaged'].includes(u.status))
      throw new ConvexError('Open update not found.');
    await ctx.db.patch('policyUpdates', u._id, { status: 'dismissed' });
    return null;
  },
});

export const version = query({
  args: { key: v.string(), version: v.number() },
  returns: v.union(v.null(), schema.doc('policyVersions')),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    return ctx.db
      .query('policyVersions')
      .withIndex('by_owner_and_key_and_version', (q) =>
        q.eq('owner', owner).eq('key', args.key).eq('version', args.version),
      )
      .unique();
  },
});
