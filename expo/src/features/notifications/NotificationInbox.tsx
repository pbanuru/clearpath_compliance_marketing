import { RouterAnchor } from '@/components/RouterAnchor';
import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { useConvexAuth, useQuery } from 'convex/react';
import { FiBell, FiX, FiArrowRight } from 'react-icons/fi';
import { api } from '@clearpath/backend/convex/_generated/api';
import { Popover } from '@/components/overlays/Popover';
import { NotificationRow } from './NotificationRow';
import { MarkAllRead, NotificationEmpty, useNotificationClock } from './shared';
import './notifications.css';
import './inbox.css';

export function NotificationInbox() {
  const { isAuthenticated } = useConvexAuth();
  return isAuthenticated ? <Inbox /> : null;
}
function Inbox() {
  const count = useQuery(api.notifications.unreadCount, {}) ?? 0;
  const [open, setOpen] = useState(false);
  const bell = useRef<HTMLButtonElement>(null);
  const now = useNotificationClock();
  const data = useQuery(
    api.notifications.list,
    open ? { filter: 'all', paginationOpts: { numItems: 8, cursor: null } } : 'skip',
  );
  function close() {
    setOpen(false);
  }
  return (
    <>
      <button
        ref={bell}
        className="app-icon-button cp-notification-bell"
        type="button"
        aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="notification-inbox"
        onClick={() => setOpen(!open)}
      >
        <FiBell size={19} aria-hidden="true" />
        {count > 0 && (
          <span className="cp-notification-badge" aria-hidden="true">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      <Popover
        open={open}
        onClose={close}
        anchor={bell}
        className="cp-notification-inbox"
        id="notification-inbox"
        label="Notifications"
        stylePosition
        dimBackdrop
      >
        <div className="cp-inbox-heading">
          <div>
            <h2 id="notification-inbox-title">Notifications</h2>
            <p>{count ? `${count} unread` : 'You’re up to date'}</p>
          </div>
          <button
            className="cp-icon"
            type="button"
            aria-label="Close notifications"
            onClick={close}
            autoFocus
          >
            <FiX aria-hidden="true" />
          </button>
        </div>
        <div className="cp-inbox-toolbar">
          <span>Latest updates</span>
          <MarkAllRead count={count} />
        </div>
        <div className="cp-inbox-content">
          {!data ? (
            <p role="status" className="cp-inbox-loading">
              Loading notifications…
            </p>
          ) : data.page.length ? (
            <ul className="cp-notification-list">
              {data.page.map((item) => (
                <NotificationRow key={item._id} item={item} now={now} onNavigate={close} />
              ))}
            </ul>
          ) : (
            <NotificationEmpty />
          )}
        </div>
        <Link href="/notifications" asChild>
          <RouterAnchor className="cp-inbox-footer" onClick={close}>
            View all notifications <FiArrowRight aria-hidden="true" />
          </RouterAnchor>
        </Link>
      </Popover>
    </>
  );
}
