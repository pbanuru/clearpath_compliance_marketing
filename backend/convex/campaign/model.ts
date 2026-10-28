import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { product } from '../review/types';

export const contextFields = {
  name: v.string(),
  product: v.optional(product),
  offerTerms: v.optional(v.string()),
  goLiveDate: v.optional(v.string()),
  notes: v.optional(v.string()),
};
export const statusCounts = v.object({
  needs_review: v.number(),
  changes_requested: v.number(),
  approved: v.number(),
  rejected: v.number(),
  total: v.number(),
});
export const emptyCounts = {
  needs_review: 0,
  changes_requested: 0,
  approved: 0,
  rejected: 0,
  total: 0,
};
export const campaignTable = defineTable({
  owner: v.string(),
  ...contextFields,
  counts: statusCounts,
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_owner_and_updatedAt', ['owner', 'updatedAt'])
  .index('by_owner_and_name', ['owner', 'name'])
  .searchIndex('search_name', { searchField: 'name', filterFields: ['owner'] });
