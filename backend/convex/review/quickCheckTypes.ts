import { v } from 'convex/values';
import { product, channel } from './types';

export const quickContext = v.object({
  assetIds: v.array(v.id('assets')),
  product,
  channel,
  jurisdictions: v.array(v.string()),
  offerTerms: v.optional(v.string()),
  notes: v.optional(v.string()),
});
export const riskBand = v.union(v.literal('likely'), v.literal('possible'), v.literal('low'));
export const quickRule = v.object({
  ruleId: v.string(),
  title: v.string(),
  source: v.object({ label: v.string(), url: v.union(v.string(), v.null()) }),
  probability: v.union(v.number(), v.null()),
  band: v.union(riskBand, v.null()),
  refusal: v.boolean(),
});
export const quickNote = v.object({
  assetId: v.id('assets'),
  status: v.literal('unsupported'),
  message: v.string(),
});
export const quickRisk = v.object({ likely: v.number(), possible: v.number() });
export const quickStatus = v.union(
  v.literal('running'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('unsupported'),
);
