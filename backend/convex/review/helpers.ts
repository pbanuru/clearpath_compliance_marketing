import { ConvexError } from 'convex/values';
import type { Doc, Id } from '../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Infer } from 'convex/values';
import { eventType, location } from './types';

export async function ownedReview(ctx: QueryCtx, reviewId: Id<'reviews'>, owner: string) {
  const review = await ctx.db.get('reviews', reviewId);
  if (!review || review.owner !== owner) throw new ConvexError('Review not found.');
  return review;
}
export async function ownedAssets(ctx: QueryCtx, ids: Id<'assets'>[], owner: string) {
  if (!ids.length || ids.length > 32) throw new ConvexError('Choose between 1 and 32 assets.');
  const assets = await Promise.all(ids.map((id) => ctx.db.get('assets', id)));
  for (const asset of assets)
    if (!asset || asset.owner !== owner) throw new ConvexError('Asset not found.');
}
export function bucket(status: Doc<'reviews'>['status']) {
  return status === 'checking' || status === 'in_review' ? 'needs_review' : status;
}
export async function changeStatus(
  ctx: MutationCtx,
  review: Doc<'reviews'>,
  status: Doc<'reviews'>['status'],
  extra: Partial<Doc<'reviews'>> = {},
) {
  const oldBucket = bucket(review.status),
    newBucket = bucket(status);
  const row = await ctx.db
    .query('reviewCounts')
    .withIndex('by_owner', (q) => q.eq('owner', review.owner))
    .unique();
  const wasApproved = !!review.wasApproved || review.status === 'approved';
  const recheckOpen = status === 'in_review' && (extra.recheckOpen ?? review.recheckOpen ?? false);
  const recheckDelta = Number(recheckOpen) - Number(!!review.recheckOpen);
  const approvalDelta = Number(status === 'approved' && !wasApproved);
  if (row && (oldBucket !== newBucket || recheckDelta || approvalDelta)) {
    const counts = {
      needs_review: row.needs_review,
      changes_requested: row.changes_requested,
      approved: row.approved,
    };
    if (oldBucket !== newBucket) {
      if (oldBucket !== 'rejected') counts[oldBucket]--;
      if (newBucket !== 'rejected') counts[newBucket]++;
    }
    await ctx.db.patch('reviewCounts', row._id, {
      ...counts,
      rechecks: Math.max(0, (row.rechecks ?? 0) + recheckDelta),
      approvedHistory: (row.approvedHistory ?? row.approved) + approvalDelta,
    });
  }
  await ctx.db.patch('reviews', review._id, {
    status,
    wasApproved: wasApproved || status === 'approved',
    recheckOpen,
    queueBucket: newBucket,
    updatedAt: Date.now(),
    ...(status !== review.status ? { waitingSince: Date.now() } : {}),
    ...extra,
  });
}
export async function event(
  ctx: MutationCtx,
  review: Doc<'reviews'>,
  type: Infer<typeof eventType>,
  detail?: string,
  findingId?: Id<'findings'>,
) {
  await ctx.db.insert('reviewEvents', {
    owner: review.owner,
    reviewId: review._id,
    type,
    version: review.currentVersion,
    detail,
    findingId,
    at: Date.now(),
  });
}
export async function currentVersion(ctx: QueryCtx, review: Doc<'reviews'>) {
  const version = await ctx.db
    .query('reviewVersions')
    .withIndex('by_reviewId_and_number', (q) =>
      q.eq('reviewId', review._id).eq('number', review.currentVersion),
    )
    .unique();
  if (!version || version.owner !== review.owner) throw new ConvexError('Version not found.');
  return version;
}
export async function versionFindings(ctx: QueryCtx, reviewId: Id<'reviews'>, version: number) {
  return (
    ctx.db
      .query('findings')
      .withIndex('by_reviewId_and_version', (q) =>
        q.eq('reviewId', reviewId).eq('version', version),
      )
      // At most 100 retained manual findings plus 100 AI findings after a retry.
      .take(201)
  );
}
export async function refreshCounts(ctx: MutationCtx, review: Doc<'reviews'>) {
  const counts = { required: 0, recommended: 0, needs_context: 0 };
  for (const f of await versionFindings(ctx, review._id, review.currentVersion))
    if (f.status === 'open' || f.status === 'accepted') counts[f.severity]++;
  await ctx.db.patch('reviews', review._id, { counts, updatedAt: Date.now() });
}
export function validateLocation(
  value: Infer<typeof location> | undefined,
  assetIds: Id<'assets'>[],
) {
  if (!value) return;
  if (!assetIds.includes(value.assetId))
    throw new ConvexError('Location must refer to an asset in this version.');
  if (value.region) {
    const { x, y, width, height } = value.region;
    if (
      ![x, y, width, height].every(Number.isFinite) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 1.000001 ||
      y + height > 1.000001
    )
      throw new ConvexError('Region must fit within the image.');
  }
  if (
    (value.startSeconds !== undefined &&
      (!Number.isFinite(value.startSeconds) || value.startSeconds < 0)) ||
    (value.endSeconds !== undefined &&
      (!Number.isFinite(value.endSeconds) || value.endSeconds < (value.startSeconds ?? 0))) ||
    (value.page !== undefined && (!Number.isInteger(value.page) || value.page < 1))
  )
    throw new ConvexError('Invalid location time or page.');
}
