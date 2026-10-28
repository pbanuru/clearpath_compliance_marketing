import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { internal } from '../_generated/api';
export const plan = internalMutation({
  args: { id: v.id('sourceRuns'), cursor: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { id, cursor }) => {
    const run = await ctx.db.get('sourceRuns', id);
    if (!run || run.status !== 'running' || run.planningDone) return null;
    if (!cursor && (run.totalJobs ?? 0) > 0) return null;
    const sources = await ctx.db
      .query('sourceChecks')
      .withIndex('by_sourceKey')
      .paginate({ numItems: 40, cursor: cursor ?? null });
    let count = 0;
    for (const s of sources.page) {
      const active = await ctx.db
        .query('workspaceSources')
        .withIndex('by_sourceKey_and_paused', (q) =>
          q.eq('sourceKey', s.sourceKey).eq('paused', false),
        )
        .first();
      if (!active) continue;
      const jobId = await ctx.db.insert('sourceJobs', {
        sourceKey: s.sourceKey,
        runId: id,
        status: 'queued',
        attempts: 0,
      });
      await ctx.scheduler.runAfter(0, internal.policy.checkSource.run, { jobId });
      count++;
    }
    await ctx.db.patch('sourceRuns', id, {
      planningDone: sources.isDone,
      totalJobs: (run.totalJobs ?? 0) + count,
    });
    if (!sources.isDone)
      await ctx.scheduler.runAfter(0, internal.policy.dailyPlanning.plan, {
        id,
        cursor: sources.continueCursor,
      });
    else await ctx.scheduler.runAfter(0, internal.policy.sourceJobs.summarize, { id });
    return null;
  },
});
