import { v } from 'convex/values';
import { internalMutation, mutation } from '../_generated/server';
import { internal } from '../_generated/api';
import { requireOwner } from '../assetAuth';
import schema from '../schema';
import { currentVersion, changeStatus, event, refreshCounts } from '../review/helpers';
import { span } from '../review/types';
import { analysisResult } from '../review/output';
import { policyByKey } from './changes';
import { insertSpans } from '../review/usage';
import { failedAttempt } from './failedAttempt';
import { refreshRecheckFailure } from './recheckFailures';

export const start = internalMutation({
  args: { id: v.id('policyRechecks') },
  returns: v.union(
    v.null(),
    v.object({
      job: schema.doc('policyRechecks'),
      review: schema.doc('reviews'),
      assets: v.array(schema.doc('assets')),
      extractions: v.array(schema.doc('assetExtractions')),
      runKey: v.string(),
    }),
  ),
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get('policyRechecks', id);
    if (!job || job.status !== 'queued') return null;
    const r = await ctx.db.get('reviews', job.reviewId);
    const policy = await policyByKey(ctx, job.owner, job.key);
    if (
      policy.currentVersion > job.toVersion ||
      !r ||
      r.currentVersion !== job.version ||
      r.usage === 'retired' ||
      !['approved', 'in_review'].includes(r.status)
    ) {
      await ctx.db.patch('policyRechecks', id, { status: 'skipped' });
      if (r) {
        await ctx.db.patch('reviews', r._id, {
          pendingRechecks: Math.max(0, (r.pendingRechecks ?? 0) - 1),
        });
        await refreshRecheckFailure(ctx, r);
      }
      return null;
    }
    const version = await currentVersion(ctx, r),
      assets = [],
      extractions = [];
    const runKey = crypto.randomUUID();
    await ctx.db.patch('policyRechecks', id, { status: 'running', runKey, error: undefined });
    await ctx.scheduler.runAfter(6 * 60000, internal.policy.jobRecovery.recheck, { id, runKey });
    for (const assetId of version.assetIds) {
      const a = await ctx.db.get('assets', assetId);
      if (!a || a.owner !== r.owner) {
        await ctx.scheduler.runAfter(0, internal.policy.recheckState.finish, {
          id,
          runKey,
          result: null,
          error: 'Recheck asset unavailable.',
          spans: [],
        });
        return null;
      }
      assets.push(a);
      const e = await ctx.db
        .query('assetExtractions')
        .withIndex('by_assetId_and_kind', (q) => q.eq('assetId', assetId).eq('kind', 'transcript'))
        .unique();
      if (e?.owner === r.owner && e.status === 'succeeded') extractions.push(e);
    }
    await event(
      ctx,
      r,
      'recheck_started',
      `Rechecking ${job.title} v${job.fromVersion} → v${job.toVersion}.`,
    );
    return { job, review: r, assets, extractions, runKey };
  },
});
export const finish = internalMutation({
  args: {
    id: v.id('policyRechecks'),
    runKey: v.string(),
    result: v.union(analysisResult, v.null()),
    error: v.optional(v.string()),
    spans: v.array(span),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get('policyRechecks', args.id);
    if (!job) return null;
    const r = await ctx.db.get('reviews', job.reviewId);
    if (!r) return null;
    const spans =
      !args.result && !args.spans.some((s) => s.operation === 'recheck')
        ? [
            ...args.spans,
            failedAttempt('recheck', args.error ?? 'Recheck failed without a result.'),
          ]
        : args.spans;
    await insertSpans(ctx, r, job.version, args.runKey, spans);
    if (job.status !== 'running' || job.runKey !== args.runKey) return null;
    const pendingRechecks = Math.max(0, (r.pendingRechecks ?? 0) - 1);
    const policy = await policyByKey(ctx, job.owner, job.key);
    if (
      policy.currentVersion > job.toVersion ||
      r.currentVersion !== job.version ||
      r.usage === 'retired'
    ) {
      await ctx.db.patch('policyRechecks', job._id, { status: 'skipped' });
      await ctx.db.patch('reviews', r._id, { pendingRechecks });
      await refreshRecheckFailure(ctx, r);
      return null;
    }
    const approvals = await ctx.db
      .query('decisions')
      .withIndex('by_reviewId_and_version', (q) =>
        q.eq('reviewId', r._id).eq('version', job.version),
      )
      .order('desc')
      .take(100);
    const approval = approvals.find((d) => d.outcome === 'approved');
    const marker = {
      changedAt: job.createdAt,
      approvedAt: approval?.decidedAt,
      oldCheck: job.oldCheck,
      newCheck: job.newCheck,
      newFindings: args.result?.findings.length ?? 0,
      materialVersion: job.version,
      sourceLabel:
        policy.kind === 'clearpath_standard'
          ? 'ClearPath standard'
          : policy.kind === 'state_rule'
            ? 'State rule'
            : 'Rule',
      key: job.key,
      fromVersion: job.fromVersion,
      toVersion: job.toVersion,
      title: job.title,
      changeSummary: job.changeSummary,
    };
    if (!args.result) {
      await ctx.db.patch('policyRechecks', job._id, {
        status: 'failed',
        error: args.error ?? 'Recheck failed.',
      });
      await ctx.db.patch('reviews', r._id, { pendingRechecks, recheckFailed: true });
      await event(
        ctx,
        r,
        'recheck_failed',
        `${job.title} v${job.toVersion}: ${args.error ?? 'Recheck failed.'}`,
      );
      return null;
    }
    for (const f of args.result.findings) {
      if (f.policyId !== job.key) throw new Error('Recheck finding cited another policy.');
      await ctx.db.insert('findings', {
        ...f,
        owner: r.owner,
        reviewId: r._id,
        version: job.version,
        source: 'recheck',
        policyVersion: job.toVersion,
        status: 'open',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
    const hasFindings = args.result.findings.length > 0;
    await ctx.db.patch('policyRechecks', job._id, {
      status: hasFindings ? 'findings' : 'passed',
      error: undefined,
    });
    await ctx.db.patch('reviews', r._id, { pendingRechecks });
    await refreshRecheckFailure(ctx, r);
    if (hasFindings) {
      await changeStatus(ctx, r, 'in_review', { recheck: marker, recheckOpen: true });
      await refreshCounts(ctx, r);
      await event(
        ctx,
        r,
        'recheck_findings',
        `Rechecked against ${job.title} v${job.toVersion}: ${args.result.findings.length} finding(s). ${job.changeSummary}`,
      );
    } else
      await event(
        ctx,
        r,
        'recheck_passed',
        `Rechecked against ${job.title} v${job.toVersion}: no issues`,
      );
    return null;
  },
});
export const retry = mutation({
  args: {
    reviewId: v.optional(v.id('reviews')),
    key: v.optional(v.string()),
    toVersion: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const reviewId = args.reviewId;
    const jobs = reviewId
      ? await ctx.db
          .query('policyRechecks')
          .withIndex('by_reviewId', (q) => q.eq('reviewId', reviewId))
          .take(500)
      : await ctx.db
          .query('policyRechecks')
          .withIndex('by_owner_and_key_and_toVersion', (q) =>
            q
              .eq('owner', owner)
              .eq('key', args.key ?? '')
              .eq('toVersion', args.toVersion ?? 0),
          )
          .take(500);
    let count = 0;
    for (const j of jobs) {
      if (j.owner !== owner) throw new Error('Recheck not found.');
      if (j.status !== 'failed') continue;
      const r = await ctx.db.get('reviews', j.reviewId);
      if (!r || r.currentVersion !== j.version || r.usage === 'retired') continue;
      const policy = await policyByKey(ctx, owner, j.key);
      if (policy.currentVersion > j.toVersion) {
        await ctx.db.patch('policyRechecks', j._id, { status: 'skipped' });
        await refreshRecheckFailure(ctx, r);
        continue;
      }
      await ctx.db.patch('policyRechecks', j._id, { status: 'queued' });
      await ctx.db.patch('reviews', r._id, { pendingRechecks: (r.pendingRechecks ?? 0) + 1 });
      await ctx.scheduler.runAfter(0, internal.policy.recheck.run, { id: j._id });
      count++;
    }
    return count;
  },
});
