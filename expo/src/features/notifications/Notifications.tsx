import { usePaginatedQuery, useQuery } from 'convex/react';
import { Link, useLocalSearchParams } from 'expo-router';
import { api } from '@clearpath/backend/convex/_generated/api';
import { NotificationRow } from './NotificationRow';
import { dayLabel } from './model';
import { MarkAllRead, NotificationEmpty, useNotificationClock } from './shared';
import './notifications.css';

export function Notifications() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const filter = params.filter === 'unread' ? 'unread' : 'all';
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.list,
    { filter },
    { initialNumItems: 25 },
  );
  const count = useQuery(api.notifications.unreadCount, {}) ?? 0;
  const now = useNotificationClock();
  const groups = new Map<string, typeof results>();
  for (const item of results) {
    const day = dayLabel(item.createdAt, now);
    const group = groups.get(day) ?? [];
    group.push(item);
    groups.set(day, group);
  }
  return (
    <main className="cp-page cp-notifications-page">
      <div className="cp-page-heading cp-notifications-heading">
        <div>
          <span className="cp-eyebrow">YOUR INBOX</span>
          <h1>Notifications</h1>
          <p>Updates that need your attention, all in one place.</p>
        </div>
        <MarkAllRead count={count} />
      </div>
      <nav className="cp-notifications-filters" aria-label="Notification filter">
        <Link href="/notifications" asChild>
          <a aria-current={filter === 'all' ? 'page' : undefined}>All</a>
        </Link>
        <Link href="/notifications?filter=unread" asChild>
          <a aria-current={filter === 'unread' ? 'page' : undefined}>
            Unread {count > 0 && <span>{count}</span>}
          </a>
        </Link>
      </nav>
      {status === 'LoadingFirstPage' ? (
        <p role="status">Loading notifications…</p>
      ) : results.length === 0 ? (
        <NotificationEmpty unread={filter === 'unread'} />
      ) : (
        <div className="cp-notifications-groups">
          {Array.from(groups, ([day, items]) => (
            <section key={day} aria-label={day}>
              <h2>{day}</h2>
              <ul className="cp-notification-list">
                {items.map((item) => (
                  <NotificationRow key={item._id} item={item} now={now} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {(status === 'CanLoadMore' || status === 'LoadingMore') && (
        <button
          className="cp-button cp-notifications-more"
          disabled={status === 'LoadingMore'}
          onClick={() => loadMore(25)}
        >
          {status === 'LoadingMore' ? 'Loading…' : 'Load more notifications'}
        </button>
      )}
    </main>
  );
}
