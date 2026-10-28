import type { FunctionReturnType } from 'convex/server';
import type { api } from '@clearpath/backend/convex/_generated/api';
export type QueueReview = FunctionReturnType<typeof api.reviews.queue>['page'][number];
export const columns = [
  {
    status: 'checking',
    title: 'Checking',
    empty: 'No checks in progress',
    hint: 'New submissions are checked here first.',
  },
  {
    status: 'in_review',
    title: 'Needs review',
    empty: 'You’re all caught up',
    hint: 'Material ready for your judgment lands here.',
  },
  {
    status: 'changes_requested',
    title: 'Changes requested',
    empty: 'No changes outstanding',
    hint: 'Submissions waiting for a revision appear here.',
  },
  {
    status: 'approved',
    title: 'Approved',
    empty: 'Ready when you are',
    hint: 'Approved material will collect here.',
  },
] as const;
export function elapsed(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
export function urgency(review: QueueReview, now: number) {
  if (!review.goLiveDate || review.status === 'approved' || review.status === 'rejected')
    return null;
  const today = new Date(now);
  const midnight = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((Date.parse(`${review.goLiveDate}T00:00:00Z`) - midnight) / 86400000);
  if (!Number.isFinite(days)) return null;
  return {
    tone: days < 0 ? 'late' : days <= 2 ? 'soon' : '',
    text:
      days < 0
        ? `Go-live ${Math.abs(days)}d overdue`
        : days === 0
          ? 'Goes live today'
          : days === 1
            ? 'Goes live tomorrow'
            : `Goes live in ${days} days`,
  };
}

export const stageOrder = ['in_review', 'checking', 'changes_requested', 'approved', 'rejected'];
