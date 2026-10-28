import type { Infer } from 'convex/values';
import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { span } from './types';

// Called inside the same transaction as the final findings/analysis result.
export async function insertSpans(
  ctx: MutationCtx,
  review: { owner: string; _id?: Doc<'reviews'>['_id'] },
  version: number | undefined,
  runKey: string,
  spans: Infer<typeof span>[],
) {
  const recorded = await persistSpans(
    ctx,
    { owner: review.owner, reviewId: review._id, version },
    runKey,
    spans,
  );
  const reviewId = review._id;
  if (!recorded || !reviewId) return;
  const cost = await ctx.db
    .query('reviewCosts')
    .withIndex('by_reviewId', (q) => q.eq('reviewId', reviewId))
    .unique();
  const totals = {
    knownUsd: (cost?.knownUsd ?? 0) + spans.reduce((sum, s) => sum + (s.costUsd ?? 0), 0),
    unknownCalls: (cost?.unknownCalls ?? 0) + spans.filter((s) => s.costUsd === null).length,
    spans: (cost?.spans ?? 0) + spans.length,
  };
  if (cost) await ctx.db.patch('reviewCosts', cost._id, totals);
  else await ctx.db.insert('reviewCosts', { owner: review.owner, reviewId, ...totals });
}

export async function persistSpans(
  ctx: MutationCtx,
  target: {
    owner: string;
    reviewId?: Doc<'reviews'>['_id'];
    version?: number;
    assetId?: Doc<'assets'>['_id'];
  },
  runKey: string,
  spans: Infer<typeof span>[],
) {
  const existing = await ctx.db
    .query('aiSpans')
    .withIndex('by_runKey', (q) => q.eq('runKey', runKey))
    .first();
  if (existing) return false;
  for (const span of spans) {
    await ctx.db.insert('aiSpans', {
      ...span,
      ...target,
      runKey,
    });
    const day = new Date(span.startedAt).toISOString().slice(0, 10);
    const row = await ctx.db
      .query('aiUsageDaily')
      .withIndex('by_owner_and_day_and_provider_and_model_and_operation', (q) =>
        q
          .eq('owner', target.owner)
          .eq('day', day)
          .eq('provider', span.provider)
          .eq('model', span.model)
          .eq('operation', span.operation),
      )
      .unique();
    const counts = {
      calls: (row?.calls ?? 0) + 1,
      failedCalls: (row?.failedCalls ?? 0) + (span.status === 'failed' ? 1 : 0),
      knownCostUsd: (row?.knownCostUsd ?? 0) + (span.costUsd ?? 0),
      unknownCostCalls: (row?.unknownCostCalls ?? 0) + (span.costUsd === null ? 1 : 0),
    };
    if (row) await ctx.db.patch('aiUsageDaily', row._id, counts);
    else
      await ctx.db.insert('aiUsageDaily', {
        owner: target.owner,
        day,
        provider: span.provider,
        model: span.model,
        operation: span.operation,
        ...counts,
      });
  }
  return true;
}
