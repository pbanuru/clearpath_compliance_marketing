import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import schema from '../schema';
import { currentVersion, changeStatus, event, refreshCounts, versionFindings } from './helpers';
import { analysisResult } from './output';
import { ensurePolicies, currentPolicies, matches } from '../policy/library';
import { policy } from './policies';
import { span } from './types';
import { insertSpans } from './usage';

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
      policies: v.array(policy.extend({ currentVersion: v.number() })),
    }),
  ),
  handler: async (ctx, args) => {
    const review = await ctx.db.get('reviews', args.reviewId);
    if (!review || review.currentVersion !== args.version || review.status !== 'checking')
      return null;
    const version = await currentVersion(ctx, review);
    if (version.analysis.status !== 'queued') return null;
    await ensurePolicies(ctx, review.owner);
    const policies = (await currentPolicies(ctx, review.owner))
      .filter((p) => matches(p, review))
      .map((p) => ({
        id: p.key,
        title: p.title,
        kind: p.kind,
        jurisdiction: p.jurisdiction,
        appliesTo: p.appliesTo,
        check: p.check,
        source: { label: p.source.label, url: p.source.url },
        currentVersion: p.currentVersion,
      }));
    const runKey = crypto.randomUUID();
    const analysis = { status: 'running' as const, startedAt: Date.now(), runKey };
    await ctx.db.patch('reviewVersions', version._id, {
      analysis,
      policyVersions: policies.map((p) => ({ key: p.id, version: p.currentVersion })),
    });
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
    const previous = [];
    if (args.version > 1)
      for await (const finding of versionFindings(ctx, review._id, args.version - 1))
        if (finding.owner === review.owner && finding.status === 'accepted') previous.push(finding);
    return {
      review,
      version: { ...version, analysis },
      assets,
      previous,
      extractions,
      runKey,
      policies,
    };
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
      for await (const finding of versionFindings(ctx, review._id, args.version))
        if (finding.source === 'ai') await ctx.db.delete('findings', finding._id);
      for (const finding of args.result.findings)
        await ctx.db.insert('findings', {
          ...finding,
          owner: review.owner,
          reviewId: review._id,
          version: args.version,
          source: 'ai',
          policyVersion: version.policyVersions?.find((p) => p.key === finding.policyId)?.version,
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
    await event(
      ctx,
      review,
      args.result ? 'analysis_finished' : 'analysis_failed',
      args.result?.summary ?? args.error,
    );
    return null;
  },
});
