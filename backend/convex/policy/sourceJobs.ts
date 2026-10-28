import { v } from 'convex/values';
import { internalMutation, internalQuery } from '../_generated/server';
import { internal } from '../_generated/api';
import schema from '../schema';
import { monitor, draft } from './tables';
import { span } from '../review/types';
import { insertSpans } from '../review/usage';

export function isTransient(error: string) {
  return /HTTP (429|5\d\d)\b|network|fetch failed|timeout|timed out|socket|connection|abort/i.test(
    error,
  );
}
export function runIsStale(run: { finishedAt?: number } | null, now = Date.now()) {
  return !run?.finishedAt || now - run.finishedAt > 26 * 60 * 60 * 1000;
}
export const start = internalMutation({
  args: { jobId: v.id('sourceJobs') },
  returns: v.union(
    v.null(),
    v.object({
      job: schema.doc('sourceJobs'),
      source: schema.doc('sourceChecks'),
      keys: v.array(v.string()),
      monitors: v.array(monitor),
    }),
  ),
  handler: async (ctx, { jobId }) => {
    const j = await ctx.db.get('sourceJobs', jobId);
    if (!j || j.status !== 'queued') return null;
    const s = await ctx.db
      .query('sourceChecks')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', j.sourceKey))
      .unique();
    if (!s) return null;
    if (s.activeJobId && s.activeJobId !== jobId) {
      const active = await ctx.db.get('sourceJobs', s.activeJobId);
      if (active?.status === 'running') {
        await ctx.scheduler.runAfter(60000, internal.policy.checkSource.run, { jobId });
        return null;
      }
    }

    const watchers = await ctx.db
      .query('workspaceSources')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', j.sourceKey))
      .take(500);
    const active = watchers.filter((w) => !w.paused),
      keys = [...new Set(active.flatMap((w) => w.linkedRules))];
    const job = {
      ...j,
      status: 'running' as const,
      attempts: j.attempts + 1,
      startedAt: Date.now(),
    };
    await ctx.db.patch('sourceJobs', jobId, {
      status: job.status,
      attempts: job.attempts,
      startedAt: job.startedAt,
    });
    await ctx.db.patch('sourceChecks', s._id, { activeJobId: jobId });
    await ctx.scheduler.runAfter(6 * 60000, internal.policy.jobRecovery.source, {
      jobId,
      attempt: job.attempts,
    });
    return {
      job,
      source: s,
      keys,
      monitors: [...new Map(active.map((w) => [JSON.stringify(w.monitor), w.monitor])).values()],
    };
  },
});
export const unknown = internalQuery({
  args: { fingerprints: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, { fingerprints }) => {
    const result = [];
    for (const f of fingerprints)
      if (
        !(await ctx.db
          .query('sourceSignals')
          .withIndex('by_fingerprint', (q) => q.eq('fingerprint', f))
          .unique())
      )
        result.push(f);
    return result;
  },
});
export const finish = internalMutation({
  args: {
    jobId: v.id('sourceJobs'),
    attempt: v.number(),
    fingerprint: v.optional(v.string()),
    text: v.optional(v.string()),
    listingInitialized: v.optional(v.boolean()),
    urls: v.array(v.string()),
    signals: v.array(v.object({ fingerprint: v.string(), drafts: v.array(draft) })),
    spans: v.array(span),
    error: v.optional(v.string()),
    transient: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const j = await ctx.db.get('sourceJobs', args.jobId);
    if (!j || j.status !== 'running' || j.attempts !== args.attempt) return null;
    const s = await ctx.db
      .query('sourceChecks')
      .withIndex('by_sourceKey', (q) => q.eq('sourceKey', j.sourceKey))
      .unique();
    if (!s) return null;
    const now = Date.now(),
      retry = !!args.error && args.transient && j.attempts < 3;
    await ctx.db.insert('sourceAttempts', {
      jobId: j._id,
      sourceKey: j.sourceKey,
      attempt: j.attempts,
      startedAt: j.startedAt ?? now,
      durationMs: now - (j.startedAt ?? now),
      status: args.error ? 'failed' : 'succeeded',
      error: args.error,
    });
    await insertSpans(
      ctx,
      { owner: 'system:policy-monitor' },
      undefined,
      `source:${j._id}:${args.attempt}`,
      args.spans,
    );
    await ctx.db.patch('sourceJobs', j._id, {
      status: retry ? 'queued' : args.error ? 'failed' : 'succeeded',
      lastError: args.error,
      finishedAt: retry ? undefined : now,
      ...(!args.error ? { lastSuccessAt: now } : {}),
    });
    await ctx.db.patch('sourceChecks', s._id, {
      activeJobId: s.activeJobId === j._id ? undefined : s.activeJobId,
      lastCheckedAt: now,
      lastError: args.error,
      ...(!args.error
        ? {
            lastSuccessAt: now,
            fingerprint: args.fingerprint ?? s.fingerprint,
            text: args.text ?? s.text,
            listingInitialized: args.listingInitialized ?? s.listingInitialized,
          }
        : {}),
    });
    if (!args.error) {
      await ctx.scheduler.runAfter(0, internal.policy.monitorState.checked, {
        sourceKey: j.sourceKey,
        cursor: null,
      });
      for (const url of args.urls) {
        const old = await ctx.db
          .query('sourceSeen')
          .withIndex('by_sourceKey_and_url', (q) => q.eq('sourceKey', j.sourceKey).eq('url', url))
          .unique();
        if (!old) await ctx.db.insert('sourceSeen', { sourceKey: j.sourceKey, url });
      }
      for (const signal of args.signals) {
        const old = await ctx.db
          .query('sourceSignals')
          .withIndex('by_fingerprint', (q) => q.eq('fingerprint', signal.fingerprint))
          .unique();
        if (!old) {
          const signalId = await ctx.db.insert('sourceSignals', {
            sourceKey: j.sourceKey,
            ...signal,
            detectedAt: now,
          });
          if (j.runId) {
            const run = await ctx.db.get('sourceRuns', j.runId);
            if (run)
              await ctx.db.patch('sourceRuns', run._id, {
                updates: run.updates + signal.drafts.length,
              });
          }
          if (signal.drafts.length)
            await ctx.scheduler.runAfter(0, internal.policy.monitorState.fanout, {
              signalId,
              cursor: null,
            });
        }
      }
    }
    if (retry)
      await ctx.scheduler.runAfter(
        j.attempts === 1 ? 5 * 60000 : 25 * 60000,
        internal.policy.checkSource.run,
        { jobId: j._id },
      );
    if (j.runId && !retry) {
      const run = await ctx.db.get('sourceRuns', j.runId);
      if (run)
        await ctx.db.patch('sourceRuns', run._id, {
          completedJobs: (run.completedJobs ?? 0) + 1,
          failedJobs: (run.failedJobs ?? 0) + (args.error ? 1 : 0),
          checked: run.checked + (args.error ? 0 : 1),
          errors: args.error ? [...run.errors, args.error].slice(-100) : run.errors,
        });
    }
    if (j.runId)
      await ctx.scheduler.runAfter(0, internal.policy.sourceJobs.summarize, { id: j.runId });
    return null;
  },
});
export const summarize = internalMutation({
  args: { id: v.id('sourceRuns') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const run = await ctx.db.get('sourceRuns', id);
    if (!run) return null;
    const pending = !run.planningDone || (run.completedJobs ?? 0) < (run.totalJobs ?? 0);
    await ctx.db.patch('sourceRuns', id, {
      status: pending ? 'running' : (run.failedJobs ?? 0) > 0 ? 'failed' : 'succeeded',
      finishedAt: pending ? undefined : Date.now(),
    });
    return null;
  },
});
