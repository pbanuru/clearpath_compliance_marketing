import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import type { QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import schema from '../schema';
import { quickContext, quickRule, quickNote, quickStatus } from './quickCheckTypes';
import { ownedAssets, currentVersion } from './helpers';
import { insertSpans } from './usage';
import { span } from './types';

async function loadAssets(ctx: QueryCtx, ids: Id<'assets'>[], owner: string) {
  await ownedAssets(ctx, ids, owner);
  const assets: Doc<'assets'>[] = [];
  const seen = new Set<string>();
  async function visit(id: Id<'assets'>) {
    if (seen.has(id)) return;
    if (seen.size >= 128) throw new Error('Too many captured material parts.');
    seen.add(id);
    const asset = await ctx.db.get('assets', id);
    if (!asset || asset.owner !== owner) throw new Error('Asset not found.');
    assets.push(asset);
    if (asset.kind === 'webpage') for (const child of asset.content.parts) await visit(child);
  }
  for (const id of ids) await visit(id);
  return assets;
}
export const claim = internalMutation({
  args: { owner: v.string(), contextHash: v.string(), context: quickContext },
  returns: v.object({
    check: schema.doc('quickChecks'),
    claimed: v.boolean(),
    assets: v.array(schema.doc('assets')),
    extractions: v.array(schema.doc('assetExtractions')),
  }),
  handler: async (ctx, args) => {
    const assets = await loadAssets(ctx, args.context.assetIds, args.owner);
    const old = await ctx.db
      .query('quickChecks')
      .withIndex('by_owner_and_contextHash', (q) =>
        q.eq('owner', args.owner).eq('contextHash', args.contextHash),
      )
      .unique();
    const now = Date.now();
    // Transactional lease also deduplicates simultaneous submit/analysis requests.
    if (
      old &&
      (old.status === 'succeeded' ||
        old.status === 'unsupported' ||
        (old.status === 'running' && now - old.startedAt < 300000) ||
        (old.status === 'failed' && now - (old.finishedAt ?? now) < 30000))
    )
      return { check: old, claimed: false, assets: [], extractions: [] };
    const fields = {
      ...args,
      status: 'running' as const,
      rules: [],
      notes: [],
      startedAt: now,
      finishedAt: undefined,
      error: undefined,
      runKey: crypto.randomUUID(),
    };
    const id = old?._id ?? (await ctx.db.insert('quickChecks', fields));
    if (old) await ctx.db.patch('quickChecks', id, fields);
    const check = await ctx.db.get('quickChecks', id);
    if (!check) throw new Error('Quick check unavailable.');
    const extractions: Doc<'assetExtractions'>[] = [];
    for (const asset of assets) {
      const extraction = await ctx.db
        .query('assetExtractions')
        .withIndex('by_assetId_and_kind', (q) =>
          q.eq('assetId', asset._id).eq('kind', 'transcript'),
        )
        .unique();
      if (extraction?.owner === args.owner && extraction.status === 'succeeded')
        extractions.push(extraction);
    }
    return { check, claimed: true, assets, extractions };
  },
});
export const read = internalQuery({
  args: { id: v.id('quickChecks') },
  returns: v.union(schema.doc('quickChecks'), v.null()),
  handler: (ctx, { id }) => ctx.db.get('quickChecks', id),
});
export const finish = internalMutation({
  args: {
    id: v.id('quickChecks'),
    runKey: v.string(),
    status: quickStatus,
    rules: v.array(quickRule),
    notes: v.array(quickNote),
    error: v.optional(v.string()),
    spans: v.array(span),
    extractions: v.array(schema.doc('assetExtractions').omit('_id', '_creationTime')),
    reviewId: v.optional(v.id('reviews')),
    version: v.optional(v.number()),
  },
  returns: schema.doc('quickChecks'),
  handler: async (ctx, args) => {
    const check = await ctx.db.get('quickChecks', args.id);
    if (!check) throw new Error('Quick check not found.');
    const review = args.reviewId ? await ctx.db.get('reviews', args.reviewId) : null;
    if (review && review.owner !== check.owner) throw new Error('Review owner mismatch.');
    await insertSpans(
      ctx,
      { owner: check.owner, _id: review?._id },
      args.version,
      args.runKey,
      args.spans,
      args.id,
    );
    if (check.runKey !== args.runKey || check.status !== 'running') return check;
    for (const extraction of args.extractions) {
      const asset = await ctx.db.get('assets', extraction.assetId);
      if (asset?.owner !== check.owner || extraction.owner !== check.owner)
        throw new Error('Extraction owner mismatch.');
      const old = await ctx.db
        .query('assetExtractions')
        .withIndex('by_assetId_and_kind', (q) =>
          q.eq('assetId', extraction.assetId).eq('kind', 'transcript'),
        )
        .unique();
      if (!old) await ctx.db.insert('assetExtractions', extraction);
      else if (old.status !== 'succeeded')
        await ctx.db.patch('assetExtractions', old._id, extraction);
    }
    const patch = {
      status: args.status,
      rules: args.rules,
      notes: args.notes,
      error: args.error,
      finishedAt: Date.now(),
    };
    await ctx.db.patch('quickChecks', args.id, patch);
    return { ...check, ...patch };
  },
});
export const attach = internalMutation({
  args: {
    reviewId: v.id('reviews'),
    version: v.number(),
    runKey: v.string(),
    id: v.id('quickChecks'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const review = await ctx.db.get('reviews', args.reviewId);
    const check = await ctx.db.get('quickChecks', args.id);
    if (!review || !check || check.owner !== review.owner)
      throw new Error('Quick check not found.');
    if (review.currentVersion !== args.version) return null;
    const version = await currentVersion(ctx, review);
    if (version.analysis.runKey === args.runKey)
      await ctx.db.patch('reviewVersions', version._id, { quickCheckId: args.id });
    return null;
  },
});
