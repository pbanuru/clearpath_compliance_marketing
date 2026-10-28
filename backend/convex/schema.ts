import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { asset, fileReference, uploadKind } from './assetTypes';

export default defineSchema({
  assets: defineTable(asset).index('by_owner', ['owner']),
  assetUploads: defineTable({
    owner: v.string(),
    name: v.string(),
    kind: uploadKind,
    original: fileReference,
    poster: v.optional(fileReference),
    assetId: v.optional(v.id('assets')),
  }).index('by_owner', ['owner']),
});
