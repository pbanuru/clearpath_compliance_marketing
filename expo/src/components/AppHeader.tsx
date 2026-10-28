import { useEffect, useRef, useState } from 'react';
import { Link } from 'expo-router';
import { FiChevronDown, FiLogOut, FiMoon, FiSun, FiUser } from 'react-icons/fi';
import { useSetTheme } from '@/features/theme/ThemeProvider';
import './AppHeader.css';

type Account = {
  user: { id: string; name?: string; email: string; profilePictureUrl?: string } | null;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function AppHeader({ account }: { account: Account }) {
  const setTheme = useSetTheme();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const control = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const { user } = account;
  const accountName = user?.name?.trim() || user?.email || 'Account';

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector('button')?.focus();
    function onPointer(event: PointerEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target))
        setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        control.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
          <button
            type="button"
            className="app-icon-button theme-to-dark"
            onClick={() => setTheme('dark')}
            aria-label="Switch to dark mode"
          >
            <FiMoon size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="app-icon-button theme-to-light"
            onClick={() => setTheme('light')}
            aria-label="Switch to light mode"
          >
            <FiSun size={18} aria-hidden="true" />
          </button>
          <div
            className="app-account"
            ref={container}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
            }}
          >
            <button
              ref={control}
              type="button"
              className="app-account-button"
              disabled={account.isLoading || busy}
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
            {open && user && (
              <div className="app-account-menu" id="account-menu" ref={menu}>
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
              </div>
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
