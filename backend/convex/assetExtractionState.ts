import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import type { MutationCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { internal } from './_generated/api';
import schema from './schema';
import { extractionKind, videoEvent } from './review/videoTypes';
import { span } from './review/types';
import { persistSpans } from './review/usage';

export async function ensureExtractions(
  ctx: MutationCtx,
  asset: Doc<'assets'>,
  retryFailed = false,
) {
  if (asset.kind !== 'audio' && asset.kind !== 'video') return;
  const kinds =
    asset.kind === 'video'
      ? (['transcript', 'video_timeline'] as const)
      : (['transcript'] as const);
  for (const kind of kinds) {
    const existing = await ctx.db
      .query('assetExtractions')
      .withIndex('by_assetId_and_kind', (q) => q.eq('assetId', asset._id).eq('kind', kind))
      .unique();
    if (existing && existing.owner !== asset.owner) throw new Error('Extraction owner mismatch.');
    if (existing && (!retryFailed || existing.status !== 'failed')) continue;
    if (existing)
      await ctx.db.patch('assetExtractions', existing._id, {
        status: 'queued',
        runKey: undefined,
        error: undefined,
      });
    else
      await ctx.db.insert('assetExtractions', {
        owner: asset.owner,
        assetId: asset._id,
        kind,
        status: 'queued',
        segments: [],
        model: kind === 'transcript' ? 'universal-3-5-pro' : 'gemini-3.1-pro-preview',
        createdAt: Date.now(),
      });
    await ctx.scheduler.runAfter(0, internal.assetExtraction.run, { assetId: asset._id, kind });
  }
}
export const ensure = internalMutation({
  args: { assetIds: v.array(v.id('assets')), owner: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const id of args.assetIds) {
      const asset = await ctx.db.get('assets', id);
      if (!asset || asset.owner !== args.owner) throw new Error('Asset not found.');
      await ensureExtractions(ctx, asset);
    }
    return null;
  },
});
export const list = internalQuery({
  args: { assetIds: v.array(v.id('assets')), owner: v.string() },
  returns: v.array(schema.doc('assetExtractions')),
  handler: async (ctx, args) => {
    const rows = [];
    for (const id of args.assetIds) {
      const asset = await ctx.db.get('assets', id);
      if (!asset || asset.owner !== args.owner) throw new Error('Asset not found.');
      for (const row of await ctx.db
        .query('assetExtractions')
        .withIndex('by_assetId_and_kind', (q) => q.eq('assetId', id))
        .take(2))
        if (row.owner === args.owner) rows.push(row);
    }
    return rows;
  },
});
export const start = internalMutation({
  args: { assetId: v.id('assets'), kind: extractionKind },
  returns: v.union(v.null(), v.object({ asset: schema.doc('assets'), runKey: v.string() })),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset) return null;
    const row = await ctx.db
      .query('assetExtractions')
      .withIndex('by_assetId_and_kind', (q) => q.eq('assetId', args.assetId).eq('kind', args.kind))
      .unique();
    if (!row || row.owner !== asset.owner || row.status !== 'queued') return null;
    const runKey = crypto.randomUUID();
    await ctx.db.patch('assetExtractions', row._id, { status: 'running', runKey });
    await ctx.scheduler.runAfter(480000, internal.assetExtractionState.expire, {
      id: row._id,
      runKey,
    });
    return { asset, runKey };
  },
});
export const finish = internalMutation({
  args: {
    assetId: v.id('assets'),
    kind: extractionKind,
    runKey: v.string(),
    model: v.string(),
    error: v.optional(v.string()),
    segments: v.array(v.object({ start: v.number(), end: v.number(), text: v.string() })),
    words: v.optional(v.array(v.object({ start: v.number(), end: v.number(), text: v.string() }))),
    wordsTruncated: v.optional(v.boolean()),
    segmentsTruncated: v.optional(v.boolean()),
    timeline: v.optional(v.array(videoEvent)),
    spans: v.array(span),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const asset = await ctx.db.get('assets', args.assetId);
    const row = await ctx.db
      .query('assetExtractions')
      .withIndex('by_assetId_and_kind', (q) => q.eq('assetId', args.assetId).eq('kind', args.kind))
      .unique();
    if (!asset || !row || row.owner !== asset.owner) return null;
    const recorded = await persistSpans(
      ctx,
      { owner: asset.owner, assetId: asset._id },
      args.runKey,
      args.spans,
    );
    const spans = recorded ? [...(row.spans ?? []), ...args.spans] : (row.spans ?? []);
    if (row.runKey !== args.runKey || row.status !== 'running') {
      // A late completion still incurred costs; preserve the deadline outcome.
      await ctx.db.patch('assetExtractions', row._id, { spans });
      return null;
    }
    const { assetId: _assetId, kind: _kind, ...result } = args;
    await ctx.db.patch('assetExtractions', row._id, {
      ...result,
      spans,
      status: args.error ? 'failed' : 'succeeded',
    });
    return null;
  },
});
export const expire = internalMutation({
  args: { id: v.id('assetExtractions'), runKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get('assetExtractions', args.id);
    if (row?.status === 'running' && row.runKey === args.runKey)
      await ctx.db.patch('assetExtractions', row._id, {
        status: 'failed',
        error: 'Extraction exceeded its deadline. Provider billing may be unknown.',
      });
    return null;
  },
});
