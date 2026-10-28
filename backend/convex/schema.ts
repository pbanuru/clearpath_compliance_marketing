import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { asset, fileReference, frameReference, uploadKind } from './assetTypes';

import { sourceTables } from './policy/sourceTables';
import { policyTables } from './policy/tables';
import { reviewTables } from './review/tables';

export default defineSchema({
  ...reviewTables,
  ...policyTables,
  ...sourceTables,
  assets: defineTable(asset).index('by_owner', ['owner']),
  assetUploads: defineTable({
    owner: v.string(),
    name: v.string(),
    kind: uploadKind,
    original: fileReference,
    poster: v.optional(fileReference),
    frames: v.optional(v.array(frameReference)),
    assetId: v.optional(v.id('assets')),
  }).index('by_owner', ['owner']),
});
