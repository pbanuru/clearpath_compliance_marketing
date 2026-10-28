import type { Doc } from '../_generated/dataModel';

type OrderedReview = Pick<Doc<'reviews'>, 'goLiveDate' | 'waitingSince' | 'pinnedRank'>;
// Leave space between calendar days while preserving waiting-time order within each day.
// An explicit rank can sit anywhere in this order without pinning neighboring items.
export function queueRank(review: OrderedReview, order: 'go_live' | 'waiting' = 'go_live') {
  if (review.pinnedRank !== undefined) return review.pinnedRank;
  if (order === 'waiting') return review.waitingSince / 10000000;
  const day = review.goLiveDate ? Date.parse(`${review.goLiveDate}T00:00:00Z`) / 86400000 : NaN;
  return (Number.isFinite(day) ? day * 10000000 : 1e14) + review.waitingSince / 10000000;
}
export function queueCompare(
  a: OrderedReview,
  b: OrderedReview,
  order: 'go_live' | 'waiting' = 'go_live',
) {
  return queueRank(a, order) - queueRank(b, order) || a.waitingSince - b.waitingSince;
}
