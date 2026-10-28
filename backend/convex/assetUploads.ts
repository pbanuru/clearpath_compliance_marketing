import { ConvexError, v } from 'convex/values';
import { action, internalMutation, internalQuery, mutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { requireOwner } from './assetAuth';
import { kindForMime, requireFileSize } from './assetTypes';
import { storage, uploadUrl } from './assetStorage';

export const begin = mutation({
  args: {
    name: v.string(),
    mimeType: v.string(),
    size: v.number(),
    poster: v.optional(v.object({ size: v.number() })),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const kind = kindForMime(args.mimeType);
    requireFileSize(args.size);
    if (!args.name.trim()) throw new ConvexError('Enter a file name.');
    if ((kind === 'video') !== (args.poster !== undefined))
      throw new ConvexError('A video requires a generated poster.');
    if (args.poster) requireFileSize(args.poster.size);
    const original = {
      key: crypto.randomUUID(),
      name: args.name,
      mimeType: args.mimeType,
      size: args.size,
    };
    const poster = args.poster
      ? {
          key: crypto.randomUUID(),
          name: `${args.name}.poster.jpg`,
          mimeType: 'image/jpeg',
          size: args.poster.size,
        }
      : undefined;
    const uploadId = await ctx.db.insert('assetUploads', {
      owner,
      name: args.name,
      kind,
      original,
      poster,
    });
    return {
      uploadId,
      original: await uploadUrl(original),
      poster: poster ? await uploadUrl(poster) : null,
    };
  },
});

export const requireClaim = internalQuery({
  args: { uploadId: v.id('assetUploads'), owner: v.string() },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get('assetUploads', args.uploadId);
    if (!claim || claim.owner !== args.owner) throw new ConvexError('Upload not found.');
    return claim;
  },
});

export const finalize = action({
  args: { uploadId: v.id('assetUploads') },
  handler: async (ctx, args): Promise<Id<'assets'>> => {
    const owner = await requireOwner(ctx);
    const claim: Doc<'assetUploads'> = await ctx.runQuery(internal.assetUploads.requireClaim, {
      ...args,
      owner,
    });
    if (claim.assetId) return claim.assetId;
    await storage.syncMetadata(ctx, claim.original.key);
    if (claim.poster) await storage.syncMetadata(ctx, claim.poster.key);
    return ctx.runMutation(internal.assetUploads.commit, { ...args, owner });
  },
});

export const resume = mutation({
  args: { uploadId: v.id('assetUploads') },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const claim = await ctx.db.get('assetUploads', args.uploadId);
    if (!claim || claim.owner !== owner) throw new ConvexError('Upload not found.');
    return {
      uploadId: claim._id,
      original: await uploadUrl(claim.original),
      poster: claim.poster ? await uploadUrl(claim.poster) : null,
    };
  },
});

export const commit = internalMutation({
  args: { uploadId: v.id('assetUploads'), owner: v.string() },
  handler: async (ctx, args): Promise<Id<'assets'>> => {
    const claim = await ctx.db.get('assetUploads', args.uploadId);
    if (!claim || claim.owner !== args.owner) throw new ConvexError('Upload not found.');
    if (claim.assetId) return claim.assetId;
    for (const file of [claim.original, ...(claim.poster ? [claim.poster] : [])]) {
      const metadata = await storage.getMetadata(ctx, file.key);
      if (!metadata || metadata.size !== file.size || metadata.contentType !== file.mimeType) {
        throw new ConvexError('Uploaded file does not match the selected file. Choose it again.');
      }
    }
    const common = { owner: claim.owner, name: claim.name, version: 1 as const };
    let assetId: Id<'assets'>;
    switch (claim.kind) {
      case 'video':
        if (!claim.poster) throw new ConvexError('Video poster is missing.');
        assetId = await ctx.db.insert('assets', {
          ...common,
          kind: 'video',
          content: { original: claim.original, poster: claim.poster },
        });
        break;
      case 'document':
        assetId = await ctx.db.insert('assets', {
          ...common,
          kind: 'document',
          content: { original: claim.original, parts: [] },
        });
        break;
      case 'image':
      case 'audio':
        assetId = await ctx.db.insert('assets', {
          ...common,
          kind: claim.kind,
          content: { original: claim.original },
        });
        break;
    }
    await ctx.db.patch('assetUploads', claim._id, { assetId });
    return assetId;
  },
});
