import { createContext, useContext } from 'react';

interface AccountUser {
  id: string;
  email: string;
  name?: string;
  profilePictureUrl?: string;
}

export interface Account {
  user: AccountUser | null;
  isLoading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  fetchAccessToken: (options: { forceRefreshToken: boolean }) => Promise<string | null>;
}

export const AccountContext = createContext<Account | null>(null);

export function useAccount(): Account {
  const account = useContext(AccountContext);
  if (!account) throw new Error('useAccount must be used within AccountProvider.');
  return account;
}
