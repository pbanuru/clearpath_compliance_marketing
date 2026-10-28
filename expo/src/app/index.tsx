import type { GenerateMetadataFunction } from 'expo-router/server';
import { APP_NAME } from '@/config';
import { AppHeader } from '@/components/AppHeader';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { useAccount } from '@/features/auth/useAccount';

export const generateMetadata: GenerateMetadataFunction = () => ({ title: APP_NAME });

export default function Home() {
  const account = useAccount();
  return (
    <ThemeProvider>
      <div className="clearpath-page">
        <AppHeader account={account} />
        <main className="clearpath-main">
          <h1 className="clearpath-title">{APP_NAME}</h1>
        </main>
      </div>
    </ThemeProvider>
  );
}
