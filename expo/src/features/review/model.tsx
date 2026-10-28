import type { FunctionReturnType } from 'convex/server';
import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';
import type { api } from '@clearpath/backend/convex/_generated/api';

export type ReviewDetail = FunctionReturnType<typeof api.reviews.get>;
export type Finding = Doc<'findings'>;
export type Asset = Doc<'assets'>;
export type Version = ReviewDetail['versions'][number];
export type Policy = FunctionReturnType<typeof api.policies.list>[number];
export type Filter = 'needs_review' | 'changes_requested' | 'approved' | 'all';
export const products = {
  personal_loan: 'Personal loan',
  credit_card: 'Credit card',
  mortgage_prequalification: 'Mortgage prequalification',
};
export const channels = {
  social: 'Social',
  search: 'Search',
  display: 'Display',
  email: 'Email',
  sms: 'SMS',
  landing_page: 'Landing page',
  affiliate: 'Affiliate',
  video_audio: 'Video or audio',
  print: 'Print',
  other: 'Other',
};
export const statuses = {
  checking: 'Checking',
  in_review: 'Needs review',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  rejected: 'Rejected',
};
export const severities = {
  required: 'Required',
  recommended: 'Recommended',
  needs_context: 'Needs context',
};
export const filterLabels = {
  needs_review: 'Review queue',
  changes_requested: 'Changes requested',
  approved: 'Approved',
  all: 'All submissions',
};
export function reviewFilter(value?: string): Filter {
  return value === 'changes_requested' || value === 'approved' || value === 'all'
    ? value
    : 'needs_review';
}
export function timecode(seconds: number) {
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`;
}
export function locationLabel(finding: Finding) {
  const l = finding.location;
  if (l?.quote) return `“${l.quote}”`;
  if (l?.startSeconds !== undefined)
    return `${timecode(l.startSeconds)}${l.endSeconds !== undefined ? `–${timecode(l.endSeconds)}` : ''}`;
  if (l?.page) return `Page ${l.page}`;
  if (l?.region) return 'Image region';
  return 'Material';
}
export function dateTime(value: number) {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
export function whereRuns(states: string[]) {
  return states.includes('US') ? 'National' : states.join(', ');
}
export function Status({ status }: { status: Doc<'reviews'>['status'] }) {
  return <span className={`cp-pill status-${status}`}>{statuses[status]}</span>;
}
