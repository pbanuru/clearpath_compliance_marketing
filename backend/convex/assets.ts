import { paginationOptsValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { action, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { webpageArgs, validateWebpage } from './webpageTypes';
import { requireOwner } from './assetAuth';
import { storage } from './assetStorage';

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    return ctx.db
      .query('assets')
      .withIndex('by_owner', (q) => q.eq('owner', owner))
      .order('desc')
      .paginate(args.paginationOpts);
  },
});

export const createText = mutation({
  args: { name: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    if (!args.name.trim() || !args.text.trim()) throw new ConvexError('Enter a name and text.');
    return ctx.db.insert('assets', {
      owner,
      name: args.name.trim(),
      version: 1,
      kind: 'text',
      content: { text: args.text },
    });
  },
});

export const access = query({
  args: { assetId: v.id('assets'), accessVersion: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const asset = await ctx.db.get('assets', args.assetId);
    if (!asset || asset.owner !== owner) throw new ConvexError('Asset not found.');
    if (asset.kind === 'text') return { original: null, poster: null };
    const original = asset.kind === 'webpage' ? asset.content.capture : asset.content.original;
    return {
      original: await storage.getUrl(original.key, { expiresIn: 900 }),
      poster:
        asset.kind === 'video'
          ? await storage.getUrl(asset.content.poster.key, { expiresIn: 900 })
          : null,
    };
  },
});

export const createWebpage = action({
  args: webpageArgs,
  returns: v.id('assets'),
  handler: async (ctx, args): Promise<Id<'assets'>> => {
    const owner = await requireOwner(ctx);
    validateWebpage(args);
    const claim: Doc<'assetUploads'> = await ctx.runQuery(internal.assetUploads.requireClaim, {
      uploadId: args.uploadId,
      owner,
    });
    if (claim.assetId) {
      await ctx.runMutation(internal.webpages.commit, { ...args, owner });
      return claim.assetId;
    }
    await storage.syncMetadata(ctx, claim.original.key);
    for (const tile of claim.tiles ?? []) await storage.syncMetadata(ctx, tile.key);
    return ctx.runMutation(internal.webpages.commit, { ...args, owner });
  },
});
