import { ConvexError, v } from 'convex/values';
import { action, internalMutation, internalQuery, mutation } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { requireOwner } from './assetAuth';
import { kindForMime, requireFileSize } from './assetTypes';
import { storage, uploadUrl } from './assetStorage';
import schema from './schema';

const uploadResult = v.object({
  uploadId: v.id('assetUploads'),
  original: v.string(),
  poster: v.union(v.string(), v.null()),
  frames: v.array(v.object({ at: v.number(), url: v.string() })),
});

export const begin = mutation({
  returns: uploadResult,
  args: {
    name: v.string(),
    mimeType: v.string(),
    size: v.number(),
    poster: v.optional(v.object({ size: v.number() })),
    frames: v.optional(v.array(v.object({ size: v.number(), at: v.number() }))),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const kind = kindForMime(args.mimeType);
    requireFileSize(args.size);
    if (!args.name.trim()) throw new ConvexError('Enter a file name.');
    if ((kind === 'video') !== (args.poster !== undefined))
      throw new ConvexError('A video requires a generated poster.');
    if (args.poster) requireFileSize(args.poster.size);
    if (args.frames && (kind !== 'video' || args.frames.length > 16))
      throw new ConvexError('Only videos support up to 16 frames.');
    for (const frame of args.frames ?? []) {
      requireFileSize(frame.size);
      if (!Number.isFinite(frame.at) || frame.at < 0)
        throw new ConvexError('Invalid frame timestamp.');
    }
    const frames = args.frames?.map((frame, i) => ({
      key: crypto.randomUUID(),
      name: `${args.name}.frame-${i}.jpg`,
      mimeType: 'image/jpeg',
      size: frame.size,
      at: frame.at,
    }));
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
      frames,
    });
    return {
      uploadId,
      original: await uploadUrl(original),
      poster: poster ? await uploadUrl(poster) : null,
      frames: await Promise.all(
        (frames ?? []).map(async (frame) => ({ at: frame.at, url: await uploadUrl(frame) })),
      ),
    };
  },
});

export const requireClaim = internalQuery({
  returns: schema.doc('assetUploads'),
  args: { uploadId: v.id('assetUploads'), owner: v.string() },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get('assetUploads', args.uploadId);
    if (!claim || claim.owner !== args.owner) throw new ConvexError('Upload not found.');
    return claim;
  },
});

export const finalize = action({
  returns: v.id('assets'),
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
    for (const frame of claim.frames ?? []) await storage.syncMetadata(ctx, frame.key);
    return ctx.runMutation(internal.assetUploads.commit, { ...args, owner });
  },
});

export const resume = mutation({
  returns: uploadResult,
  args: { uploadId: v.id('assetUploads') },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const claim = await ctx.db.get('assetUploads', args.uploadId);
    if (!claim || claim.owner !== owner) throw new ConvexError('Upload not found.');
    return {
      uploadId: claim._id,
      original: await uploadUrl(claim.original),
      poster: claim.poster ? await uploadUrl(claim.poster) : null,
      frames: await Promise.all(
        (claim.frames ?? []).map(async (frame) => ({ at: frame.at, url: await uploadUrl(frame) })),
      ),
    };
  },
});

export const commit = internalMutation({
  returns: v.id('assets'),
  args: { uploadId: v.id('assetUploads'), owner: v.string() },
  handler: async (ctx, args): Promise<Id<'assets'>> => {
    const claim = await ctx.db.get('assetUploads', args.uploadId);
    if (!claim || claim.owner !== args.owner) throw new ConvexError('Upload not found.');
    if (claim.assetId) return claim.assetId;
    for (const file of [
      claim.original,
      ...(claim.poster ? [claim.poster] : []),
      ...(claim.frames ?? []),
    ]) {
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
          content: { original: claim.original, poster: claim.poster, frames: claim.frames },
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
