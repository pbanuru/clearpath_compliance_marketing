import { useEffect, useState } from 'react';
import { useMutation } from 'convex/react';
import { FiCheck, FiInbox } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { errorMessage } from '@/features/assets/media';

export function useNotificationClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}
export function MarkAllRead({ count }: { count: number }) {
  const markAll = useMutation(api.notifications.markAllRead);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div className="cp-notifications-mark">
      <button
        className="cp-button quiet"
        disabled={!count || busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await markAll({});
          } catch (cause) {
            setError(errorMessage(cause, 'Unable to mark all as read. Try again.'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <FiCheck aria-hidden="true" />
        {busy ? 'Marking read…' : 'Mark all read'}
      </button>
      {error && (
        <p role="alert" className="cp-notification-error">
          {error}
        </p>
      )}
    </div>
  );
}
export function NotificationEmpty({ unread = false }: { unread?: boolean }) {
  return (
    <div className="cp-notifications-empty">
      <span>
        <FiInbox size={26} aria-hidden="true" />
      </span>
      <h2>{unread ? 'You’re all caught up' : 'Nothing needs your attention'}</h2>
      <p>
        {unread
          ? 'You have no unread notifications.'
          : 'AI check results and updates that need your attention will appear here.'}
      </p>
    </div>
  );
}
