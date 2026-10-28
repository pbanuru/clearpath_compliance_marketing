import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { ConvexProviderWithAuth, type ConvexReactClient } from 'convex/react';
import { AccountContext, useAccount, type Account } from './useAccount';

interface Session {
  user: Account['user'];
  accessToken: string | null;
}

let pendingSession: Promise<Session> | undefined;

async function loadSession(forceRefresh: boolean): Promise<Session> {
  if (pendingSession) return pendingSession;
  pendingSession = (async () => {
    const response = await fetch(`/auth/session${forceRefresh ? '?refresh=1' : ''}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Unable to load your account. Please try again.');
    const data: unknown = await response.json();
    if (typeof data !== 'object' || data === null || !('user' in data)) {
      throw new Error('Invalid account response.');
    }
    if (data.user === null) return { user: null, accessToken: null };
    const user = data.user;
    if (
      typeof user !== 'object' ||
      !('id' in user) ||
      typeof user.id !== 'string' ||
      !('email' in user) ||
      typeof user.email !== 'string' ||
      !('accessToken' in data) ||
      typeof data.accessToken !== 'string'
    ) {
      throw new Error('Invalid account response.');
    }
    return {
      user: {
        id: user.id,
        email: user.email,
        ...('name' in user && typeof user.name === 'string' ? { name: user.name } : {}),
        ...('profilePictureUrl' in user && typeof user.profilePictureUrl === 'string'
          ? { profilePictureUrl: user.profilePictureUrl }
          : {}),
      },
      accessToken: data.accessToken,
    };
  })();
  try {
    return await pendingSession;
  } finally {
    pendingSession = undefined;
  }
}

export function AccountProvider({
  client,
  children,
}: PropsWithChildren<{ client: ConvexReactClient }>) {
  const [session, setSession] = useState<Session>({ user: null, accessToken: null });
  const [isLoading, setIsLoading] = useState(true);
  const getAccessToken = useCallback(async ({ forceRefreshToken = false } = {}) => {
    try {
      const next = await loadSession(forceRefreshToken);
      setSession(next);
      return next.accessToken;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void getAccessToken().catch((error: unknown) => {
      console.error('Account session unavailable', error);
    });
  }, [getAccessToken]);

  const account = useMemo<Account>(
    () => ({
      user: session.user,
      isLoading,
      fetchAccessToken: getAccessToken,
      signIn: (options) => {
        window.location.assign(
          options?.screenHint === 'sign-up' ? '/login?screen_hint=sign-up' : '/login',
        );
        return Promise.resolve();
      },
      signOut: async () => {
        const response = await fetch('/auth/logout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) throw new Error('Unable to sign out. Please try again.');
        const data: unknown = await response.json();
        if (
          typeof data !== 'object' ||
          data === null ||
          !('url' in data) ||
          typeof data.url !== 'string'
        ) {
          throw new Error('Invalid sign-out response.');
        }
        setSession({ user: null, accessToken: null });
        window.location.assign(data.url);
      },
    }),
    [session.user, isLoading, getAccessToken],
  );

  return (
    <AccountContext.Provider value={account}>
      <ConvexProviderWithAuth client={client} useAuth={useConvexAccountAuth}>
        {children}
      </ConvexProviderWithAuth>
    </AccountContext.Provider>
  );
}

function useConvexAccountAuth() {
  const { user, isLoading, fetchAccessToken } = useAccount();
  return { isLoading, isAuthenticated: user !== null, fetchAccessToken };
}
