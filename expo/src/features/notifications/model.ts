import type { Doc } from '@clearpath/backend/convex/_generated/dataModel';

export type Notification = Doc<'notifications'>;
export function notificationHref({ link }: Notification) {
  if (link.kind === 'review')
    return `/reviews/${encodeURIComponent(link.id)}${link.findingId ? `?findingId=${encodeURIComponent(link.findingId)}` : ''}` as const;
  return `/policies?tab=${link.kind === 'source' ? 'sources' : 'rules'}&${link.kind === 'source' ? 'source' : 'update'}=${encodeURIComponent(link.id)}` as const;
}
export function relativeTime(value: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - value) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}
export function dayLabel(value: number, now: number) {
  const date = new Date(value),
    today = new Date(now),
    yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}
