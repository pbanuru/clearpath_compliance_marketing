import { v } from 'convex/values';

export const product = v.union(
  v.literal('personal_loan'),
  v.literal('credit_card'),
  v.literal('mortgage_prequalification'),
);
export const channel = v.union(
  ...(
    [
      'social',
      'search',
      'display',
      'email',
      'sms',
      'landing_page',
      'affiliate',
      'video_audio',
      'print',
      'other',
    ] as const
  ).map((s) => v.literal(s)),
);
export const severity = v.union(
  v.literal('required'),
  v.literal('recommended'),
  v.literal('needs_context'),
);
export const reviewStatus = v.union(
  v.literal('checking'),
  v.literal('in_review'),
  v.literal('changes_requested'),
  v.literal('approved'),
  v.literal('rejected'),
);
export const outcome = v.union(
  v.literal('approved'),
  v.literal('changes_requested'),
  v.literal('rejected'),
);
export const findingStatus = v.union(
  v.literal('open'),
  v.literal('accepted'),
  v.literal('dismissed'),
  v.literal('resolved'),
);
export const confidence = v.union(v.literal('high'), v.literal('medium'), v.literal('low'));
export const region = v.object({
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
});
export const location = v.object({
  assetId: v.id('assets'),
  quote: v.optional(v.string()),
  startSeconds: v.optional(v.number()),
  endSeconds: v.optional(v.number()),
  page: v.optional(v.number()),
  region: v.optional(region),
});
export const analysisStatus = v.union(
  v.literal('queued'),
  v.literal('running'),
  v.literal('succeeded'),
  v.literal('failed'),
);
export const analysis = v.object({
  status: analysisStatus,
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  summary: v.optional(v.string()),
  runKey: v.optional(v.string()),
});
export const responses = v.array(v.object({ findingId: v.id('findings'), text: v.string() }));
export const findingCounts = v.object({
  required: v.number(),
  recommended: v.number(),
  needs_context: v.number(),
});
export const eventType = v.union(
  ...(
    [
      'submitted',
      'analysis_started',
      'analysis_finished',
      'analysis_failed',
      'finding_accepted',
      'finding_dismissed',
      'finding_reopened',
      'finding_edited',
      'finding_added',
      'decided',
      'resubmitted',
      'recheck_passed',
      'recheck_started',
      'recheck_findings',
      'recheck_failed',
      'usage_changed',
    ] as const
  ).map((s) => v.literal(s)),
);
export const operation = v.union(
  v.literal('transcription'),
  v.literal('review'),
  v.literal('policy_triage'),
  v.literal('recheck'),
);
export const usage = v.object({
  inputTokens: v.optional(v.number()),
  cachedInputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  audioSeconds: v.optional(v.number()),
});
export const span = v.object({
  provider: v.literal('openai'),
  operation,
  model: v.string(),
  attempt: v.number(),
  status: v.union(v.literal('succeeded'), v.literal('failed')),
  requestId: v.optional(v.string()),
  startedAt: v.number(),
  durationMs: v.number(),
  usage,
  costUsd: v.union(v.number(), v.null()),
  costBasis: v.union(v.literal('rate_estimate'), v.literal('unknown')),
  pricingVersion: v.string(),
  error: v.optional(v.string()),
});

export const cover = v.object({
  kind: v.union(
    v.literal('text'),
    v.literal('image'),
    v.literal('audio'),
    v.literal('video'),
    v.literal('document'),
    v.literal('webpage'),
  ),
  name: v.string(),
});
