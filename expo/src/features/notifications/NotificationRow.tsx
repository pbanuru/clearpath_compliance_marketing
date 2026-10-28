import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from 'convex/react';
import {
  FiCheckCircle,
  FiAlertCircle,
  FiRefreshCw,
  FiFileText,
  FiLink,
  FiRotateCcw,
  FiArrowUpRight,
} from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';
import { notificationHref, relativeTime, type Notification } from './model';

const icons = {
  analysis_ready: FiCheckCircle,
  analysis_failed: FiAlertCircle,
  revision_received: FiRefreshCw,
  recheck_reopened: FiRotateCcw,
  policy_update: FiFileText,
  source_failing: FiLink,
};
export function NotificationRow({
  item,
  now,
  onNavigate,
}: {
  item: Notification;
  now: number;
  onNavigate?: () => void;
}) {
  const markRead = useMutation(api.notifications.markRead);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const Icon = icons[item.type];
  const href = notificationHref(item);
  return (
    <li className={`cp-notification ${item.readAt === undefined ? 'is-unread' : ''}`}>
      <a
        href={href}
        aria-busy={busy}
        onClick={async (event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            void markRead({ id: item._id }).catch((cause: unknown) =>
              setError(errorMessage(cause, 'Unable to mark as read. Try again.')),
            );
            return;
          }
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            await markRead({ id: item._id });
            onNavigate?.();
            router.push(href);
          } catch (cause) {
            setError(errorMessage(cause, 'Unable to open this notification. Try again.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <span className={`cp-notification-icon type-${item.type}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
        <span className="cp-notification-copy">
          <span className="cp-notification-title" title={item.title}>
            {item.title}
          </span>
          {item.body && (
            <span className="cp-notification-body" title={item.body}>
              {item.body}
            </span>
          )}
          <span className="cp-notification-meta">
            {item.readAt === undefined && (
              <span className="cp-notification-unread-dot" role="img" aria-label="Unread" />
            )}
            <time
              dateTime={new Date(item.createdAt).toISOString()}
              title={new Date(item.createdAt).toLocaleString()}
            >
              {relativeTime(item.createdAt, now)}
            </time>
          </span>
        </span>
        <FiArrowUpRight className="cp-notification-arrow" size={16} aria-hidden="true" />
      </a>
      {error && (
        <p className="cp-notification-error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}
