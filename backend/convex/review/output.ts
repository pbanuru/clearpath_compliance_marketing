import { v } from 'convex/values';
import { confidence, location, severity } from './types';

export const analysisFinding = v.object({
  severity,
  policyId: v.string(),
  additionalPolicyIds: v.optional(v.array(v.string())),
  title: v.string(),
  explanation: v.string(),
  suggestedFix: v.string(),
  confidence,
  location: v.optional(location),
  quoteFound: v.optional(v.boolean()),
  previousFindingId: v.optional(v.id('findings')),
});
export const analysisResult = v.object({
  summary: v.string(),
  findings: v.array(analysisFinding),
  previous: v.array(
    v.object({
      findingId: v.id('findings'),
      status: v.union(v.literal('resolved'), v.literal('still_present')),
      note: v.string(),
    }),
  ),
});
const nullableString = { type: ['string', 'null'] };
const nullableNumber = { type: ['number', 'null'] };
function object(properties: Record<string, unknown>) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}
export const outputSchema = object({
  summary: { type: 'string' },
  findings: {
    type: 'array',
    maxItems: 100,
    items: object({
      severity: { type: 'string', enum: ['required', 'recommended', 'needs_context'] },
      policyId: { type: 'string' },
      additionalPolicyIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Other provided rules that directly support the same concrete issue as the primary policyId. Exclude the primary rule; use an empty array when there are no additional supporting rules.',
      },
      title: { type: 'string' },
      explanation: { type: 'string' },
      suggestedFix: { type: 'string' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      previousFindingId: nullableString,
      location: object({
        assetId: nullableString,
        quote: nullableString,
        startSeconds: nullableNumber,
        endSeconds: nullableNumber,
        page: nullableNumber,
        region: {
          anyOf: [
            object({
              x: { type: 'number' },
              y: { type: 'number' },
              width: { type: 'number' },
              height: { type: 'number' },
            }),
            { type: 'null' },
          ],
        },
      }),
    }),
  },
  previous: {
    type: 'array',
    items: object({
      findingId: { type: 'string' },
      status: { type: 'string', enum: ['resolved', 'still_present'] },
      note: { type: 'string' },
    }),
  },
});
