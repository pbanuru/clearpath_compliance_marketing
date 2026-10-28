import { ConvexError, v } from 'convex/values';
import { mutation } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { requireOwner } from './assetAuth';
import {
  currentVersion,
  event,
  ownedReview,
  refreshCounts,
  validateLocation,
  versionFindings,
} from './review/helpers';
import { location, severity } from './review/types';
import { normalizePolicy } from './review/policies';

async function editable(ctx: QueryCtx, findingId: Id<'findings'>, owner: string) {
  const finding = await ctx.db.get('findings', findingId);
  if (!finding || finding.owner !== owner) throw new ConvexError('Finding not found.');
  const review = await ownedReview(ctx, finding.reviewId, owner);
  if (review.status !== 'in_review' || finding.version !== review.currentVersion)
    throw new ConvexError(
      'Only current-version findings in a review awaiting a decision can be changed.',
    );
  return { finding, review };
}
export const setStatus = mutation({
  args: {
    findingId: v.id('findings'),
    status: v.union(v.literal('accepted'), v.literal('dismissed'), v.literal('open')),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const { finding, review } = await editable(ctx, args.findingId, owner);
    if (finding.status === 'dismissed' && args.status === 'dismissed') {
      const detail = args.reason ?? finding.dismissReason;
      const dismissed = await ctx.db
        .query('reviewEvents')
        .withIndex('by_findingId_and_type_and_at', (q) =>
          q.eq('findingId', finding._id).eq('type', 'finding_dismissed'),
        )
        .order('desc')
        .first();
      await ctx.db.patch('findings', finding._id, { dismissReason: detail, updatedAt: Date.now() });
      if (dismissed?.owner === owner && dismissed.version === finding.version)
        await ctx.db.patch('reviewEvents', dismissed._id, { detail });
      else await event(ctx, review, 'finding_dismissed', detail, finding._id);
      return null;
    }
    await ctx.db.patch('findings', finding._id, {
      status: args.status,
      dismissReason: args.status === 'dismissed' ? args.reason : undefined,
      updatedAt: Date.now(),
    });
    await refreshCounts(ctx, review);
    await event(
      ctx,
      review,
      args.status === 'accepted'
        ? 'finding_accepted'
        : args.status === 'dismissed'
          ? 'finding_dismissed'
          : 'finding_reopened',
      args.reason,
      finding._id,
    );
    return null;
  },
});
export const edit = mutation({
  args: {
    findingId: v.id('findings'),
    title: v.optional(v.string()),
    explanation: v.optional(v.string()),
    suggestedFix: v.optional(v.union(v.string(), v.null())),
    severity: v.optional(severity),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const { finding, review } = await editable(ctx, args.findingId, owner);
    const { findingId: _id, suggestedFix, ...patch } = args;
    if (
      (patch.title !== undefined && !patch.title.trim()) ||
      (patch.explanation !== undefined && !patch.explanation.trim())
    )
      throw new ConvexError('Enter a title and explanation.');
    await ctx.db.patch('findings', finding._id, {
      ...patch,
      ...(suggestedFix === undefined
        ? {}
        : { suggestedFix: suggestedFix?.trim() ? suggestedFix : undefined }),
      updatedAt: Date.now(),
    });
    await refreshCounts(ctx, review);
    await event(
      ctx,
      review,
      'finding_edited',
      JSON.stringify({ ...patch, suggestedFix }),
      finding._id,
    );
    return null;
  },
});
export const add = mutation({
  args: {
    reviewId: v.id('reviews'),
    severity,
    policyId: v.string(),
    title: v.string(),
    explanation: v.string(),
    suggestedFix: v.optional(v.string()),
    location: v.optional(location),
  },
  returns: v.id('findings'),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    if (review.status !== 'in_review')
      throw new ConvexError('Findings can be added only while awaiting a decision.');
    if (!args.title.trim() || !args.explanation.trim())
      throw new ConvexError('Enter a title and explanation.');
    if ((await versionFindings(ctx, review._id, review.currentVersion)).length >= 100)
      throw new ConvexError('A version supports up to 100 findings.');
    validateLocation(args.location, (await currentVersion(ctx, review)).assetIds);
    const findingId = await ctx.db.insert('findings', {
      ...args,
      policyId: normalizePolicy(args.policyId),
      owner,
      version: review.currentVersion,
      source: 'reviewer',
      status: 'accepted',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await refreshCounts(ctx, review);
    await event(ctx, review, 'finding_added', undefined, findingId);
    return findingId;
  },
});
