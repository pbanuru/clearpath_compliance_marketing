import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { monitor } from './tables';
export const sourceTables = {
  workspaceSources: defineTable({
    owner: v.string(),
    sourceKey: v.string(),
    label: v.string(),
    jurisdiction: v.string(),
    monitor,
    linkedRules: v.array(v.string()),
    paused: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_owner_and_sourceKey', ['owner', 'sourceKey'])
    // Fanout needs creation order so pausing cannot move rows across its cursor.
    // eslint-disable-next-line @convex-dev/no-duplicate-indexes -- preserve creation-order fanout cursors
    .index('by_sourceKey', ['sourceKey'])
    .index('by_sourceKey_and_paused', ['sourceKey', 'paused']),
  sourceJobs: defineTable({
    sourceKey: v.string(),
    runId: v.optional(v.id('sourceRuns')),
    status: v.union(
      v.literal('queued'),
      v.literal('running'),
      v.literal('succeeded'),
      v.literal('failed'),
    ),
    attempts: v.number(),
    lastError: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
  })
    .index('by_runId', ['runId'])
    .index('by_sourceKey', ['sourceKey']),
  sourceAttempts: defineTable({
    jobId: v.id('sourceJobs'),
    sourceKey: v.string(),
    attempt: v.number(),
    startedAt: v.number(),
    durationMs: v.number(),
    status: v.union(v.literal('succeeded'), v.literal('failed')),
    error: v.optional(v.string()),
  }).index('by_jobId', ['jobId']),
};
