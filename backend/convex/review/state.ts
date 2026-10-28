import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import type { QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import schema from '../schema';
import { currentVersion, changeStatus, event, refreshCounts, versionFindings } from './helpers';
import { analysisResult } from './output';
import { ensurePolicies, currentPolicies, matches } from '../policy/library';
import { policy } from './policies';
import { span } from './types';
import { insertSpans } from './usage';
import { savedExtraction, saveExtractions } from './saveExtractions';
import { analysisCampaign, campaignContext } from '../campaign/analysisContext';
import { notify } from '../notificationModel';

const args = { reviewId: v.id('reviews'), version: v.number() };

async function previousDecisionFindings(ctx: QueryCtx, review: Doc<'reviews'>, version: number) {
  if (version <= 1) return [];
  const decision = await ctx.db
    .query('decisions')
    .withIndex('by_reviewId_and_version', (q) =>
      q.eq('reviewId', review._id).eq('version', version - 1),
    )
    .order('desc')
    .first();
  if (!decision || decision.owner !== review.owner) throw new Error('Previous decision not found.');
  return Promise.all(
    decision.acceptedFindingIds.map(async (id) => {
      const finding = await ctx.db.get('findings', id);
      if (
        !finding ||
        finding.owner !== review.owner ||
        finding.reviewId !== review._id ||
        finding.version !== version - 1 ||
        !['accepted', 'resolved'].includes(finding.status)
      )
        throw new Error('Invalid previous finding in decision.');
      return finding;
    }),
  );
}
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
      campaign: campaignContext,
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
    // An earlier attempt may already have resolved a requested change. The
    // immutable decision, rather than that mutable status, defines every recheck.
    const previous = await previousDecisionFindings(ctx, review, args.version);
    const campaign = await analysisCampaign(ctx, review);
    return {
      review,
      version: { ...version, analysis },
      assets,
      previous,
      extractions,
      runKey,
      policies,
      campaign,
    };
  },
});
export const finish = internalMutation({
  args: {
    ...args,
    runKey: v.string(),
    result: v.union(analysisResult, v.null()),
    error: v.optional(v.string()),
    spans: v.array(span),
    extractions: v.array(savedExtraction),
    extractionNotes: v.optional(v.array(v.string())),
    frameToolRounds: v.optional(v.number()),
    frameToolFrames: v.optional(v.number()),
    frameToolCeilingHit: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const review = await ctx.db.get('reviews', args.reviewId);
    if (!review) return null;
    // Even a stale result still incurred costs; persist each run at most once.
    await insertSpans(ctx, review, args.version, args.runKey, args.spans);
    await saveExtractions(ctx, review.owner, args.extractions);
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
      const requested = new Set(
        (await previousDecisionFindings(ctx, review, args.version)).map((f) => f._id),
      );
      for (const check of args.result.previous) {
        const old = await ctx.db.get('findings', check.findingId);
        if (
          !old ||
          old.owner !== review.owner ||
          old.reviewId !== review._id ||
          old.version !== args.version - 1 ||
          !requested.has(old._id)
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
        extractionNotes: args.extractionNotes,
        frameToolRounds: args.frameToolRounds,
        frameToolFrames: args.frameToolFrames,
        frameToolCeilingHit: args.frameToolCeilingHit,
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
              `${count} ${severity === 'needs_context' ? (count === 1 ? 'needs context' : 'need context') : severity}`,
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
