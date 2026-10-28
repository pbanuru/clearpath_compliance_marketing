import { Component, useEffect, useState, type ReactNode } from 'react';
import { api } from '@clearpath/backend/convex/_generated/api';
import { useMutation, useConvexAuth } from 'convex/react';
import { usePathname } from 'expo-router';
import { AppHeader } from '@/components/AppHeader';
import { AppShell } from '@/components/AppShell';
import { useAccount } from '@/features/auth/useAccount';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { Sidebar } from './Sidebar';
import { ShortcutsProvider } from './Shortcuts';
import { Welcome, SidebarSkeleton } from './Welcome';
import './review.css';
import './queue.css';
import './workspace.css';
import './forms.css';
import './light-palette.css';
import '../campaigns/campaigns.css';
import '../campaigns/picker.css';

export function Workspace({ children }: { children: ReactNode }) {
  const account = useAccount();
  return (
    <ThemeProvider>
      <ShortcutsProvider>
        <AppShell
          header={<AppHeader account={account} />}
          sidebar={
            account.isLoading
              ? () => <SidebarSkeleton />
              : account.user
                ? (close) => <Sidebar close={close} />
                : undefined
          }
        >
          {children}
        </AppShell>
      </ShortcutsProvider>
    </ThemeProvider>
  );
}
export function SignedIn({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const path = usePathname();
  const initialize = useMutation(api.policies.initialize);
  const [error, setError] = useState('');
  useEffect(() => {
    if (isAuthenticated)
      void initialize({}).catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Unable to initialize policies.'),
      );
  }, [isAuthenticated, initialize]);
  if (error)
    return (
      <p className="cp-error" role="alert">
        {error}
      </p>
    );
  if (isLoading)
    return (
      <div className="cp-page">
        <p role="status">Loading your workspace…</p>
      </div>
    );
  return isAuthenticated ? (
    <ScreenBoundary key={path} review={path.startsWith('/reviews/')}>
      {children}
    </ScreenBoundary>
  ) : (
    <Welcome />
  );
}
class ScreenBoundary extends Component<
  { children: ReactNode; review: boolean },
  { error: string }
> {
  override state = { error: '' };
  static getDerivedStateFromError(error: Error) {
    return {
      error: error.message.includes('Review not found')
        ? 'This submission is not available in your workspace.'
        : 'This page could not be loaded. Please try again.',
    };
  }
  override render() {
    if (this.state.error)
      return (
        <main className="cp-page">
          <h1>{this.props.review ? 'Submission unavailable' : 'Unable to open this workspace'}</h1>
          <p role="alert">{this.state.error}</p>
          <button className="cp-button" onClick={() => window.location.reload()}>
            Try again
          </button>
          <a className="cp-button" href="/">
            Review queue
          </a>
        </main>
      );
    return this.props.children;
  }
}
