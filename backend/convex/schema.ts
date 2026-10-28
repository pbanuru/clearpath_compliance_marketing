import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { asset, fileReference, frameReference, uploadKind } from './assetTypes';

import { reviewTables } from './review/tables';
import { campaignTable } from './campaign/model';
import { notificationTables } from './notificationModel';

export default defineSchema({
  ...reviewTables,
  ...notificationTables,
  campaigns: campaignTable,
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
