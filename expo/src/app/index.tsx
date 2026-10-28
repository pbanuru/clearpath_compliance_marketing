import type { GenerateMetadataFunction } from 'expo-router/server';
import { APP_NAME } from '@/config';
import { AppHeader } from '@/components/AppHeader';
import { ThemeProvider } from '@/features/theme/ThemeProvider';
import { useAccount } from '@/features/auth/useAccount';
import { AssetWorkspace } from '@/features/assets/AssetWorkspace';

export const generateMetadata: GenerateMetadataFunction = () => ({ title: APP_NAME });

export default function Home() {
  const account = useAccount();
  return (
    <ThemeProvider>
      <div className="clearpath-page">
        <AppHeader account={account} />
        <main className="clearpath-main">
          <AssetWorkspace />
        </main>
      </div>
    </ThemeProvider>
  );
}
