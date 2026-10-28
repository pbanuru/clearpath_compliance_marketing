import { useRef, useState } from 'react';
import { Link } from 'expo-router';
import { FiChevronDown, FiLogOut, FiMoon, FiSun, FiUser } from 'react-icons/fi';
import { useToggleTheme } from '@/features/theme/ThemeProvider';
import { NotificationInbox } from '@/features/notifications/NotificationInbox';
import './AppHeader.css';
import { Popover } from './overlays/Popover';

type Account = {
  user: { id: string; name?: string; email: string; profilePictureUrl?: string } | null;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function AppHeader({ account }: { account: Account }) {
  const toggleTheme = useToggleTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const control = useRef<HTMLButtonElement>(null);
  const { user } = account;
  const accountName = user?.name?.trim() || user?.email || 'Account';

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to continue. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link href="/" asChild>
          <a className="app-brand" aria-label="ClearPath Marketing Compliance home">
            <img src="/brand/clearpath-mark.png" width="36" height="36" alt="" />
            <span className="app-brand-name">
              <strong>ClearPath</strong>
              <span>Marketing Compliance</span>
            </span>
          </a>
        </Link>
        <div className="app-header-controls">
          <button type="button" className="app-icon-button" onClick={toggleTheme}>
            <FiMoon className="theme-to-dark" size={18} aria-hidden="true" />
            <FiSun className="theme-to-light" size={18} aria-hidden="true" />
            <span className="app-theme-label theme-to-dark">Switch to dark mode</span>
            <span className="app-theme-label theme-to-light">Switch to light mode</span>
          </button>
          <NotificationInbox />
          <div className="app-account">
            <button
              ref={control}
              type="button"
              className="app-account-button"
              disabled={account.isLoading || (!user && busy)}
              aria-label={user ? `Account: ${accountName}` : 'Sign in'}
              aria-expanded={user ? open : undefined}
              aria-controls={user ? 'account-menu' : undefined}
              onClick={() => (user ? setOpen(!open) : void runAction(account.signIn))}
            >
              <FiUser size={18} aria-hidden="true" />
              <span className="app-account-label">
                {account.isLoading ? 'Loading…' : user ? accountName : 'Sign in'}
              </span>
              {user && <FiChevronDown size={14} aria-hidden="true" />}
            </button>
            {user && (
              <Popover
                open={open}
                onClose={() => setOpen(false)}
                anchor={control}
                className="app-account-menu"
                id="account-menu"
                label="Account"
              >
                <div className="app-account-details">
                  <strong>{user.name?.trim() || 'Account'}</strong>
                  <span>{user.email}</span>
                </div>
                <button
                  type="button"
                  className="app-sign-out"
                  disabled={busy}
                  onClick={() => void runAction(account.signOut)}
                >
                  <FiLogOut size={16} aria-hidden="true" />
                  {busy ? 'Signing out…' : 'Sign out'}
                </button>
                {error && (
                  <div role="alert" className="app-menu-error">
                    {error}
                  </div>
                )}
              </Popover>
            )}
            {error && !open && (
              <div role="alert" className="app-account-error">
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
