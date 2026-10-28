import { ConvexError, v } from 'convex/values';
import { mutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { requireOwner } from '../assetAuth';
import { ensureExtractions } from '../assetExtractionState';
import { changeStatus, currentVersion, ownedReview, versionFindings } from './helpers';

export const retryAnalysis = mutation({
  args: { reviewId: v.id('reviews') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    const version = await currentVersion(ctx, review);
    if (
      review.status !== 'in_review' ||
      (version.analysis.status !== 'failed' && !version.analysis.extractionNotes?.length)
    )
      throw new ConvexError('Only failed analysis on a review awaiting a decision can be retried.');
    for await (const finding of versionFindings(ctx, review._id, review.currentVersion)) {
      if (finding.source !== 'ai') continue;
      const activity = await ctx.db
        .query('reviewEvents')
        .withIndex('by_findingId_and_type_and_at', (q) => q.eq('findingId', finding._id))
        .first();
      if (finding.status !== 'open' || activity)
        throw new ConvexError(
          'This AI check cannot be retried after its findings have been reviewed. Your edits and decisions are preserved; continue reviewing the material by hand.',
        );
    }
    for (const id of version.assetIds) {
      const asset = await ctx.db.get('assets', id);
      if (asset?.owner === owner) await ensureExtractions(ctx, asset, true);
    }
    await ctx.db.patch('reviewVersions', version._id, { analysis: { status: 'queued' } });
    await changeStatus(ctx, review, 'checking');
    await ctx.scheduler.runAfter(0, internal.review.analysis.run, {
      reviewId: review._id,
      version: review.currentVersion,
    });
    return null;
  },
});
