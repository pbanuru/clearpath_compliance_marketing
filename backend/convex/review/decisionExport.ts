import { paginationOptsValidator, paginationResultValidator } from 'convex/server';
import { v } from 'convex/values';
import { action, internalQuery } from '../_generated/server';
import { api, internal } from '../_generated/api';
import { requireOwner } from '../assetAuth';
import { ownedReview, versionFindings } from './helpers';
import schema from '../schema';
import type { PaginationResult } from 'convex/server';
import type { Doc, Id } from '../_generated/dataModel';

const exportRow = v.object({
  reviewId: v.id('reviews'),
  title: v.string(),
  product: v.string(),
  channel: v.string(),
  jurisdictions: v.string(),
  campaign: v.string(),
  version: v.number(),
  outcome: v.string(),
  decidedBy: v.string(),
  decidedAt: v.string(),
  note: v.string(),
  acceptedFindings: v.string(),
  dismissedCount: v.union(v.number(), v.null()),
  ruleVersions: v.string(),
  aiCostUsd: v.union(v.number(), v.null()),
});
type ExportRow = typeof exportRow.type;
function ruleList(value: unknown) {
  if (!Array.isArray(value)) return '';
  return value
    .flatMap((entry: unknown) =>
      entry &&
      typeof entry === 'object' &&
      'key' in entry &&
      typeof entry.key === 'string' &&
      'version' in entry &&
      typeof entry.version === 'number'
        ? [`${entry.key}@${entry.version}`]
        : [],
    )
    .join(' | ');
}
export const decisions = internalQuery({
  args: { reviewId: v.id('reviews'), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc('decisions')),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await ownedReview(ctx, args.reviewId, owner);
    return ctx.db
      .query('decisions')
      .withIndex('by_reviewId_and_version', (q) => q.eq('reviewId', args.reviewId))
      .paginate(args.paginationOpts);
  },
});
export const evidence = internalQuery({
  args: { reviewId: v.id('reviews'), version: v.number() },
  returns: v.array(schema.doc('findings')),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await ownedReview(ctx, args.reviewId, owner);
    const findings = [];
    for await (const finding of versionFindings(ctx, args.reviewId, args.version))
      if (finding.owner === owner) findings.push(finding);
    return findings;
  },
});
export const costs = internalQuery({
  args: { reviewId: v.id('reviews'), version: v.number(), paginationOpts: paginationOptsValidator },
  returns: v.object({
    known: v.number(),
    unknown: v.boolean(),
    count: v.number(),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await ownedReview(ctx, args.reviewId, owner);
    const page = await ctx.db
      .query('aiSpans')
      .withIndex('by_reviewId_and_version', (q) =>
        q.eq('reviewId', args.reviewId).eq('version', args.version),
      )
      .paginate(args.paginationOpts);
    const own = page.page.filter((span) => span.owner === owner);
    return {
      known: own.reduce((sum, span) => sum + (span.costUsd ?? 0), 0),
      unknown: own.some((span) => span.costUsd === null),
      count: own.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const assetCosts = internalQuery({
  args: { reviewId: v.id('reviews'), version: v.number() },
  returns: v.object({ known: v.number(), unknown: v.boolean(), count: v.number() }),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    await ownedReview(ctx, args.reviewId, owner);
    const version = await ctx.db
      .query('reviewVersions')
      .withIndex('by_reviewId_and_number', (q) =>
        q.eq('reviewId', args.reviewId).eq('number', args.version),
      )
      .unique();
    if (!version || version.owner !== owner) throw new Error('Version not found.');
    let known = 0,
      unknown = false,
      count = 0;
    // Extraction histories are asset-scoped, including failed/late attempts.
    // Reused or repeated assets contribute once to each version's cost.
    for (const assetId of new Set(version.assetIds)) {
      const asset = await ctx.db.get('assets', assetId);
      if (!asset || asset.owner !== owner) throw new Error('Asset not found.');
      const extractions = await ctx.db
        .query('assetExtractions')
        .withIndex('by_assetId_and_kind', (q) => q.eq('assetId', assetId))
        .take(2);
      for (const extraction of extractions) {
        if (extraction.owner !== owner) continue;
        for (const span of extraction.spans ?? []) {
          known += span.costUsd ?? 0;
          unknown ||= span.costUsd === null;
          count++;
        }
      }
    }
    return { known, unknown, count };
  },
});

export const exportDecisions = action({
  args: { filter: v.union(v.literal('all'), v.literal('approved')) },
  returns: v.array(exportRow),
  handler: async (ctx, args): Promise<ExportRow[]> => {
    await requireOwner(ctx);
    const rows: ExportRow[] = [];
    let cursor: string | null = null;
    let finished = false;
    const costCache = new Map<string, number | null>();
    async function cost(reviewId: Id<'reviews'>, version: number): Promise<number | null> {
      const key = `${reviewId}:${version}`;
      if (costCache.has(key)) return costCache.get(key) ?? null;
      let costCursor: string | null = null,
        done = false,
        known = 0,
        unknown = false,
        count = 0;
      while (!done) {
        const page: {
          known: number;
          unknown: boolean;
          count: number;
          isDone: boolean;
          continueCursor: string;
        } = await ctx.runQuery(internal.review.decisionExport.costs, {
          reviewId,
          version,
          paginationOpts: { numItems: 100, cursor: costCursor },
        });
        known += page.known;
        unknown ||= page.unknown;
        count += page.count;
        costCursor = page.continueCursor;
        done = page.isDone;
      }
      const assets = await ctx.runQuery(internal.review.decisionExport.assetCosts, {
        reviewId,
        version,
      });
      known += assets.known;
      unknown ||= assets.unknown;
      count += assets.count;
      const value = count && !unknown ? known : null;
      costCache.set(key, value);
      return value;
    }
    while (!finished) {
      // Reuse the owner-scoped list contract, including campaign names when available.
      const page: {
        page: (Doc<'reviews'> & { campaignName?: string })[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(api.reviews.list, {
        filter: args.filter,
        paginationOpts: { numItems: 20, cursor },
      });
      for (const review of page.page) {
        let decisionCursor: string | null = null,
          done = false,
          hadDecision = false;
        const base = {
          reviewId: review._id,
          title: review.title,
          product: review.product,
          channel: review.channel,
          jurisdictions: review.jurisdictions.join(' | '),
          campaign: review.campaignName ?? '',
        };
        while (!done) {
          const decisions: PaginationResult<Doc<'decisions'>> = await ctx.runQuery(
            internal.review.decisionExport.decisions,
            {
              reviewId: review._id,
              paginationOpts: { numItems: 20, cursor: decisionCursor },
            },
          );
          for (const decision of decisions.page) {
            hadDecision = true;
            const findings: Doc<'findings'>[] = await ctx.runQuery(
              internal.review.decisionExport.evidence,
              {
                reviewId: review._id,
                version: decision.version,
              },
            );
            const accepted = new Set(decision.acceptedFindingIds);
            rows.push({
              ...base,
              version: decision.version,
              outcome: decision.outcome,
              decidedBy:
                'decidedBy' in decision && typeof decision.decidedBy === 'string'
                  ? decision.decidedBy
                  : decision.owner,
              decidedAt: new Date(decision.decidedAt).toISOString(),
              note: decision.note ?? '',
              acceptedFindings: findings
                .filter((f) => accepted.has(f._id))
                .map((f) => f.title)
                .join(' | '),
              // Historical triage can change during a rule recheck. Export the decision's
              // saved total, leaving legacy records blank rather than inventing a snapshot.
              dismissedCount: decision.dismissedCount ?? null,
              ruleVersions: ruleList(
                'policyVersions' in decision ? decision.policyVersions : undefined,
              ),
              aiCostUsd: await cost(review._id, decision.version),
            });
          }
          decisionCursor = decisions.continueCursor;
          done = decisions.isDone;
        }
        if (!hadDecision)
          rows.push({
            ...base,
            version: review.currentVersion,
            outcome: '',
            decidedBy: '',
            decidedAt: '',
            note: '',
            acceptedFindings: '',
            dismissedCount: null,
            ruleVersions: '',
            aiCostUsd: await cost(review._id, review.currentVersion),
          });
      }
      cursor = page.continueCursor;
      finished = page.isDone;
    }
    return rows;
  },
});
