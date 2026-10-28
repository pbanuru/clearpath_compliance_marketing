import type { Doc } from '../_generated/dataModel';

type OrderedReview = Pick<Doc<'reviews'>, 'goLiveDate' | 'waitingSince' | 'pinnedRank'>;
// Leave space between calendar days while preserving waiting-time order within each day.
// An explicit rank can sit anywhere in this order without pinning neighboring items.
export function queueRank(review: OrderedReview) {
  if (review.pinnedRank !== undefined) return review.pinnedRank;
  const day = review.goLiveDate ? Date.parse(`${review.goLiveDate}T00:00:00Z`) / 86400000 : NaN;
  return (Number.isFinite(day) ? day * 10000000 : 1e14) + review.waitingSince / 10000000;
}
export function queueCompare(a: OrderedReview, b: OrderedReview) {
  return queueRank(a) - queueRank(b) || a.waitingSince - b.waitingSince;
}
