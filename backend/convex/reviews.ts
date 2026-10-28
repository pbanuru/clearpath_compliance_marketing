import { detail } from './review/detail';
import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { ConvexError, v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { requireOwner } from './assetAuth';
import schema from './schema';
import { channel, product, outcome, responses, cover } from './review/types';
import {
  changeStatus,
  currentVersion,
  event,
  ownedAssets,
  ownedReview,
  versionFindings,
} from './review/helpers';

const row = schema.doc('reviews');
export const create = mutation({
  args: {
    title: v.string(),
    product,
    channel,
    jurisdictions: v.array(v.string()),
    offerTerms: v.optional(v.string()),
    goLiveDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    assetIds: v.array(v.id('assets')),
    example: v.optional(v.string()),
  },
  returns: v.id('reviews'),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await ownedAssets(ctx, args.assetIds, owner);
    if (!args.title.trim()) throw new ConvexError('Enter a review title.');
    if (!args.jurisdictions.length || args.jurisdictions.some((s) => !/^(US|[A-Z]{2})$/.test(s)))
      throw new ConvexError('Choose US or two-letter state codes.');
    if (args.goLiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(args.goLiveDate))
      throw new ConvexError('Use YYYY-MM-DD for the go-live date.');
    const { assetIds, ...context } = args;
    const coverAssetId = assetIds[0];
    if (!coverAssetId) throw new ConvexError('Choose an asset.');
    const now = Date.now();
    const reviewId = await ctx.db.insert('reviews', {
      ...context,
      title: args.title.trim(),
      owner,
      status: 'checking',
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
      waitingSince: now,
      coverAssetId,
      counts: { required: 0, recommended: 0, needs_context: 0 },
      queueBucket: 'needs_review',
      resubmissionRank: 1,
    });
    await ctx.db.insert('reviewVersions', {
      owner,
      reviewId,
      number: 1,
      assetIds,
      responses: [],
      createdAt: now,
      analysis: { status: 'queued' },
    });
    const counts = await ctx.db
      .query('reviewCounts')
      .withIndex('by_owner', (q) => q.eq('owner', owner))
      .unique();
    if (counts)
      await ctx.db.patch('reviewCounts', counts._id, {
        needs_review: counts.needs_review + 1,
        all: counts.all + 1,
      });
    else
      await ctx.db.insert('reviewCounts', {
        owner,
        needs_review: 1,
        changes_requested: 0,
        approved: 0,
        all: 1,
      });
    await ctx.db.insert('reviewEvents', {
      owner,
      reviewId,
      type: 'submitted',
      version: 1,
      at: now,
    });
    await ctx.scheduler.runAfter(0, internal.review.analysis.run, { reviewId, version: 1 });
    return reviewId;
  },
});
export const list = query({
  args: {
    filter: v.union(
      v.literal('needs_review'),
      v.literal('changes_requested'),
      v.literal('approved'),
      v.literal('all'),
    ),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(row.extend({ cover })),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const base = ctx.db.query('reviews');
    const result =
      args.filter === 'all'
        ? await base
            .withIndex('by_owner_and_updatedAt', (q) => q.eq('owner', owner))
            .order('desc')
            .paginate(args.paginationOpts)
        : args.filter === 'needs_review'
          ? await base
              .withIndex('by_owner_and_queueBucket_and_resubmissionRank_and_waitingSince', (q) =>
                q.eq('owner', owner).eq('queueBucket', 'needs_review'),
              )
              .order('asc')
              .paginate(args.paginationOpts)
          : await base
              .withIndex('by_owner_and_status_and_updatedAt', (q) =>
                q
                  .eq('owner', owner)
                  .eq('status', args.filter === 'approved' ? 'approved' : 'changes_requested'),
              )
              .order('desc')
              .paginate(args.paginationOpts);
    const page = await Promise.all(
      result.page.map(async (review) => {
        const asset = await ctx.db.get('assets', review.coverAssetId);
        if (!asset || asset.owner !== owner) throw new ConvexError('Cover asset not found.');
        return { ...review, cover: { kind: asset.kind, name: asset.name } };
      }),
    );
    return { ...result, page };
  },
});
export const counts = query({
  args: {},
  returns: v.object({
    needs_review: v.number(),
    changes_requested: v.number(),
    approved: v.number(),
    all: v.number(),
  }),
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const value = await ctx.db
      .query('reviewCounts')
      .withIndex('by_owner', (q) => q.eq('owner', owner))
      .unique();
    return {
      needs_review: value?.needs_review ?? 0,
      changes_requested: value?.changes_requested ?? 0,
      approved: value?.approved ?? 0,
      all: value?.all ?? 0,
    };
  },
});
export const get = query(detail);
export const decide = mutation({
  args: { reviewId: v.id('reviews'), version: v.number(), outcome, note: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    if (args.version !== review.currentVersion)
      throw new ConvexError('This version is stale. Reload the current version before deciding.');
    if (review.status !== 'in_review')
      throw new ConvexError('This review is not ready for a decision.');
    const findings = await versionFindings(ctx, review._id, args.version);
    const accepted = findings.filter((f) => f.status === 'accepted');
    if (args.outcome === 'approved' && accepted.length)
      throw new ConvexError('Dismiss or resolve accepted findings, or request changes.');
    if (args.outcome === 'changes_requested' && !accepted.length && !args.note?.trim())
      throw new ConvexError('Accept a finding or add a note to request changes.');
    for (const finding of findings)
      if (finding.status === 'open')
        await ctx.db.patch('findings', finding._id, {
          status: 'dismissed',
          dismissReason: 'Not raised in decision',
          updatedAt: Date.now(),
        });
    await ctx.db.insert('decisions', {
      owner,
      reviewId: review._id,
      version: args.version,
      outcome: args.outcome,
      note: args.note,
      acceptedFindingIds: accepted.map((f) => f._id),
      decidedAt: Date.now(),
    });
    const counts = { required: 0, recommended: 0, needs_context: 0 };
    for (const f of accepted) counts[f.severity]++;
    await changeStatus(ctx, review, args.outcome, { counts });
    await event(ctx, review, 'decided', JSON.stringify({ outcome: args.outcome, note: args.note }));
    return null;
  },
});
export const resubmit = mutation({
  args: {
    reviewId: v.id('reviews'),
    assetIds: v.array(v.id('assets')),
    responses,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    if (review.status !== 'changes_requested')
      throw new ConvexError('Only a review with changes requested can be resubmitted.');
    if (review.currentVersion >= 100)
      throw new ConvexError('This review has reached its version limit.');
    await ownedAssets(ctx, args.assetIds, owner);
    const previous = await versionFindings(ctx, review._id, review.currentVersion);
    const seen = new Set<string>();
    for (const response of args.responses) {
      if (
        seen.has(response.findingId) ||
        !previous.some(
          (f) => f._id === response.findingId && f.owner === owner && f.status === 'accepted',
        )
      )
        throw new ConvexError(
          'Respond only once to an accepted finding from the previous version.',
        );
      seen.add(response.findingId);
    }
    const number = review.currentVersion + 1;
    await ctx.db.insert('reviewVersions', {
      owner,
      reviewId: review._id,
      number,
      assetIds: args.assetIds,
      responses: args.responses,
      submitterNote: args.note,
      createdAt: Date.now(),
      analysis: { status: 'queued' },
    });
    await changeStatus(ctx, review, 'checking', {
      currentVersion: number,
      coverAssetId: args.assetIds[0],
      counts: { required: 0, recommended: 0, needs_context: 0 },
      resubmissionRank: 0,
    });
    await event(ctx, { ...review, currentVersion: number }, 'resubmitted', args.note);
    await ctx.scheduler.runAfter(0, internal.review.analysis.run, {
      reviewId: review._id,
      version: number,
    });
    return null;
  },
});
export const retryAnalysis = mutation({
  args: { reviewId: v.id('reviews') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const review = await ownedReview(ctx, args.reviewId, owner);
    const version = await currentVersion(ctx, review);
    if (review.status !== 'in_review' || version.analysis.status !== 'failed')
      throw new ConvexError('Only failed analysis on a review awaiting a decision can be retried.');
    await ctx.db.patch('reviewVersions', version._id, { analysis: { status: 'queued' } });
    await changeStatus(ctx, review, 'checking');
    await ctx.scheduler.runAfter(0, internal.review.analysis.run, {
      reviewId: review._id,
      version: review.currentVersion,
    });
    return null;
  },
});
