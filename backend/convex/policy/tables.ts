import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { policy } from '../review/policies';

export const monitor = v.union(
  v.object({
    type: v.literal('ecfr'),
    title: v.number(),
    part: v.string(),
    section: v.optional(v.string()),
  }),
  v.object({ type: v.literal('page'), url: v.string() }),
  v.object({
    type: v.literal('listing'),
    url: v.string(),
    format: v.union(v.literal('rss'), v.literal('sitemap'), v.literal('links')),
  }),
  v.object({ type: v.literal('internal') }),
);
export const source = v.object({ label: v.string(), url: v.union(v.string(), v.null()), monitor });
export const citation = v.object({ url: v.string(), excerpt: v.string(), retrievedAt: v.number() });
export const evidence = v.object({
  url: v.string(),
  excerpt: v.string(),
  amendmentDate: v.optional(v.string()),
  documentTitle: v.optional(v.string()),
  documentNumber: v.optional(v.string()),
  publicationDate: v.optional(v.string()),
});
export const updateKind = v.union(
  v.literal('amended'),
  v.literal('page_changed'),
  v.literal('new_rule'),
);
export const draft = v.object({
  jurisdiction: v.optional(v.string()),
  triageError: v.optional(v.string()),
  key: v.union(v.string(), v.null()),
  title: v.string(),
  appliesTo: policy.fields.appliesTo,
  kind: updateKind,
  evidence,
  aiSummary: v.string(),
  proposedCheck: v.string(),
});
export const sourceDraft = draft.extend({ owners: v.optional(v.array(v.string())) });
export const policyTables = {
  policies: defineTable({
    owner: v.string(),
    key: v.string(),
    jurisdiction: v.optional(v.string()),
    kind: policy.fields.kind,
    currentVersion: v.number(),
    source,
    lastCheckedAt: v.optional(v.number()),
    lastChangedAt: v.number(),
  }).index('by_owner_and_key', ['owner', 'key']),
  policyVersions: defineTable({
    owner: v.string(),
    key: v.string(),
    jurisdiction: v.optional(v.string()),
    version: v.number(),
    title: v.string(),
    appliesTo: policy.fields.appliesTo,
    check: v.string(),
    changeSummary: v.string(),
    createdBy: v.union(v.literal('seed'), v.literal('reviewer'), v.literal('source_update')),
    createdAt: v.number(),
    citation: v.optional(citation),
    citationError: v.optional(v.string()),
  }).index('by_owner_and_key_and_version', ['owner', 'key', 'version']),
  policyWorkspaces: defineTable({ owner: v.string() }).index('by_owner', ['owner']),
  policyUpdates: defineTable({
    owner: v.string(),
    fingerprint: v.string(),
    detectedAt: v.number(),
    ...draft.fields,
    sourceKey: v.optional(v.string()),
    appliedKey: v.optional(v.string()),
    appliedVersion: v.optional(v.number()),
    status: v.union(
      v.literal('open'),
      v.literal('not_triaged'),
      v.literal('applied'),
      v.literal('dismissed'),
    ),
  })
    .index('by_owner_and_sourceKey', ['owner', 'sourceKey'])
    .index('by_owner_and_status', ['owner', 'status'])
    .index('by_owner_and_fingerprint', ['owner', 'fingerprint']),
  sourceChecks: defineTable({
    activeJobId: v.optional(v.id('sourceJobs')),
    lastSuccessAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    listingInitialized: v.optional(v.boolean()),
    sourceKey: v.string(),
    monitor: v.optional(monitor),
    fingerprint: v.string(),
    text: v.string(),
    lastCheckedAt: v.number(),
  }).index('by_sourceKey', ['sourceKey']),
  sourceSeen: defineTable({ sourceKey: v.string(), url: v.string() }).index(
    'by_sourceKey_and_url',
    ['sourceKey', 'url'],
  ),
  sourceSignals: defineTable({
    sourceKey: v.string(),
    fingerprint: v.string(),
    drafts: v.array(sourceDraft),
    detectedAt: v.number(),
  })
    .index('by_fingerprint', ['fingerprint'])
    .index('by_sourceKey', ['sourceKey']),
  sourceRuns: defineTable({
    planningDone: v.optional(v.boolean()),
    totalJobs: v.optional(v.number()),
    completedJobs: v.optional(v.number()),
    failedJobs: v.optional(v.number()),
    key: v.literal('daily'),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    status: v.union(v.literal('running'), v.literal('succeeded'), v.literal('failed')),
    errors: v.array(v.string()),
    checked: v.number(),
    updates: v.number(),
  }).index('by_key', ['key']),
  policyRechecks: defineTable({
    owner: v.string(),
    reviewId: v.id('reviews'),
    version: v.number(),
    key: v.string(),
    fromVersion: v.number(),
    toVersion: v.number(),
    title: v.string(),
    changeSummary: v.string(),
    oldCheck: v.string(),
    newCheck: v.string(),
    createdAt: v.number(),
    status: v.union(
      v.literal('queued'),
      v.literal('running'),
      v.literal('passed'),
      v.literal('findings'),
      v.literal('failed'),
      v.literal('skipped'),
    ),
    runKey: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index('by_owner_and_key_and_toVersion', ['owner', 'key', 'toVersion'])
    .index('by_reviewId_and_version_and_status', ['reviewId', 'version', 'status']),
};
