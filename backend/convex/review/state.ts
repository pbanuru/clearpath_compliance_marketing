import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import schema from '../schema';
import { currentVersion, changeStatus, event, refreshCounts, versionFindings } from './helpers';
import { analysisResult } from './output';
import { span } from './types';
import { insertSpans } from './usage';
import { notify } from '../notificationModel';

const args = { reviewId: v.id('reviews'), version: v.number() };
export const start = internalMutation({
  args,
  returns: v.union(
    v.null(),
    v.object({
      review: schema.doc('reviews'),
      version: schema.doc('reviewVersions'),
      assets: v.array(schema.doc('assets')),
      previous: v.array(schema.doc('findings')),
      extractions: v.array(schema.doc('assetExtractions')),
      runKey: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const review = await ctx.db.get('reviews', args.reviewId);
    if (!review || review.currentVersion !== args.version || review.status !== 'checking')
      return null;
    const version = await currentVersion(ctx, review);
    if (version.analysis.status !== 'queued') return null;
    const runKey = crypto.randomUUID();
    const analysis = { status: 'running' as const, startedAt: Date.now(), runKey };
    await ctx.db.patch('reviewVersions', version._id, { analysis });
    await event(ctx, review, 'analysis_started');
    const assets = [],
      extractions = [];
    for (const id of version.assetIds) {
      const asset = await ctx.db.get('assets', id);
      if (!asset || asset.owner !== review.owner)
        throw new Error('An asset in this version is unavailable.');
      assets.push(asset);
      const extraction = await ctx.db
        .query('assetExtractions')
        .withIndex('by_assetId_and_kind', (q) => q.eq('assetId', id).eq('kind', 'transcript'))
        .unique();
      if (extraction?.owner === review.owner && extraction.status === 'succeeded')
        extractions.push(extraction);
    }
    const previous =
      args.version > 1
        ? (await versionFindings(ctx, review._id, args.version - 1)).filter(
            (f) => f.owner === review.owner && f.status === 'accepted',
          )
        : [];
    return { review, version: { ...version, analysis }, assets, previous, extractions, runKey };
  },
});
const extraction = schema.doc('assetExtractions').omit('_id', '_creationTime');
export const finish = internalMutation({
  args: {
    ...args,
    runKey: v.string(),
    result: v.union(analysisResult, v.null()),
    error: v.optional(v.string()),
    spans: v.array(span),
    extractions: v.array(extraction),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const review = await ctx.db.get('reviews', args.reviewId);
    if (!review) return null;
    // Even a stale result still incurred costs; persist each run at most once.
    await insertSpans(ctx, review, args.version, args.runKey, args.spans);
    for (const extraction of args.extractions) {
      const asset = await ctx.db.get('assets', extraction.assetId);
      if (extraction.owner !== review.owner || asset?.owner !== review.owner)
        throw new Error('Extraction owner mismatch.');
      const old = await ctx.db
        .query('assetExtractions')
        .withIndex('by_assetId_and_kind', (q) =>
          q.eq('assetId', extraction.assetId).eq('kind', 'transcript'),
        )
        .unique();
      if (!old) await ctx.db.insert('assetExtractions', extraction);
      else if (old.status !== 'succeeded')
        await ctx.db.patch('assetExtractions', old._id, extraction);
    }
    if (review.currentVersion !== args.version || review.status !== 'checking') return null;
    const version = await currentVersion(ctx, review);
    if (version.analysis.status !== 'running' || version.analysis.runKey !== args.runKey)
      return null;
    const now = Date.now();
    if (args.result) {
      // Retry after a failed run must not duplicate its findings.
      for (const finding of await versionFindings(ctx, review._id, args.version))
        if (finding.source === 'ai') await ctx.db.delete('findings', finding._id);
      for (const finding of args.result.findings)
        await ctx.db.insert('findings', {
          ...finding,
          owner: review.owner,
          reviewId: review._id,
          version: args.version,
          source: 'ai',
          status: 'open',
          createdAt: now,
          updatedAt: now,
        });
      for (const check of args.result.previous) {
        const old = await ctx.db.get('findings', check.findingId);
        if (
          !old ||
          old.owner !== review.owner ||
          old.reviewId !== review._id ||
          old.version !== args.version - 1 ||
          old.status !== 'accepted'
        )
          throw new Error('Invalid previous finding in recheck.');
        await ctx.db.patch('findings', old._id, {
          status: check.status === 'resolved' ? 'resolved' : 'accepted',
          recheckNote: check.note,
          updatedAt: now,
        });
      }
    }
    await ctx.db.patch('reviewVersions', version._id, {
      analysis: {
        ...version.analysis,
        status: args.result ? 'succeeded' : 'failed',
        finishedAt: now,
        summary: args.result?.summary,
        error: args.result
          ? undefined
          : (args.error ?? 'AI analysis failed. You can review by hand or retry.'),
      },
    });
    await changeStatus(ctx, review, 'in_review');
    await refreshCounts(ctx, review);
    const counts = { required: 0, recommended: 0, needs_context: 0 };
    for (const finding of args.result?.findings ?? []) counts[finding.severity]++;
    const body = args.result
      ? Object.entries(counts)
          .filter(([, count]) => count > 0)
          .map(
            ([severity, count]) =>
              `${count} ${severity === 'needs_context' ? 'need context' : severity}`,
          )
          .join(' · ') || 'No issues found'
      : 'Review by hand or try the AI check again.';
    await notify(ctx, review.owner, {
      type: args.result ? 'analysis_ready' : 'analysis_failed',
      title: `${args.result ? 'AI check finished' : 'AI check failed'}: ${review.title}`,
      body,
      link: { kind: 'review', id: review._id },
    });
    await event(
      ctx,
      review,
      args.result ? 'analysis_finished' : 'analysis_failed',
      args.result?.summary ?? args.error,
    );
    return null;
  },
});
