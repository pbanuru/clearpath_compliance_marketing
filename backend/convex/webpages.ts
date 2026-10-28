import { ConvexError, v } from 'convex/values';
import { internalMutation } from './_generated/server';
import { storage } from './assetStorage';
import { validateWebpage, webpageArgs } from './webpageTypes';
import { limitBlocks } from './webpageBlocks';
import { recordUsage } from './review/usage';
import type { Span } from './review/openai';

export const commit = internalMutation({
  args: { ...webpageArgs, owner: v.string() },
  returns: v.id('assets'),
  handler: async (ctx, args) => {
    const claim = await ctx.db.get('assetUploads', args.uploadId);
    if (!claim || claim.owner !== args.owner) throw new ConvexError('Upload not found.');
    if (claim.assetId) {
      const existing = await ctx.db.get('assets', claim.assetId);
      if (existing?.kind !== 'webpage')
        throw new ConvexError('This upload is already another asset.');
      return claim.assetId;
    }
    validateWebpage(args);
    if (
      claim.kind !== 'image' ||
      claim.original.mimeType !== 'image/jpeg' ||
      claim.poster ||
      claim.frames?.length
    )
      throw new ConvexError('A web page requires a JPEG screenshot upload.');
    const tiles = claim.tiles ?? [];
    let end = 0;
    for (const tile of tiles) {
      if (tile.y !== end) throw new ConvexError('Page tiles must cover the screenshot in order.');
      end += tile.height;
    }
    if (tiles.length && end !== args.size.height)
      throw new ConvexError('Page tiles do not cover the screenshot.');
    for (const file of [claim.original, ...tiles]) {
      const metadata = await storage.getMetadata(ctx, file.key);
      if (!metadata || metadata.size !== file.size || metadata.contentType !== file.mimeType)
        throw new ConvexError('Uploaded screenshot does not match the capture. Please retry.');
    }
    const limited = limitBlocks(args.blocks);
    const capturedAt = args.capturedAt ?? Date.now();
    const assetId = await ctx.db.insert('assets', {
      owner: claim.owner,
      version: 1,
      name: args.title.trim().slice(0, 500) || new URL(args.finalUrl).hostname,
      kind: 'webpage',
      content: {
        sourceUrl: args.sourceUrl,
        finalUrl: args.finalUrl,
        title: args.title.slice(0, 500),
        capture: claim.original,
        parts: [],
        size: args.size,
        blocks: limited.blocks,
        blocksTruncated: limited.blocksTruncated || !!args.blocksTruncated,
        heightTruncated: args.heightTruncated,
        capturedAt,
        tiles,
      },
    });
    const span: Span = {
      provider: 'cloudflare',
      operation: 'page_capture',
      model: 'browser-run',
      attempt: 1,
      status: 'succeeded',
      startedAt: capturedAt,
      durationMs: args.browserMs,
      usage: { browserMs: args.browserMs },
      costUsd: (args.browserMs / 3600000) * 0.09,
      costBasis: 'rate_estimate',
      pricingVersion:
        'cloudflare-browser-run-2026-10-28; $0.09/browser-hour; Workers Paid includes 10 hours/month, marginal charge may be zero; concurrency charges excluded',
    };
    await ctx.db.insert('aiSpans', {
      ...span,
      owner: claim.owner,
      assetId,
      version: 1,
      runKey: `capture:${claim._id}`,
    });
    await recordUsage(ctx, claim.owner, span);
    await ctx.db.patch('assetUploads', claim._id, { assetId });
    return assetId;
  },
});
