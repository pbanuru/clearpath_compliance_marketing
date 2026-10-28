import type { GenerateMetadataFunction } from 'expo-router/server';
import { APP_NAME } from '@/config';
import { Queue } from '@/features/review/Queue';
import { SignedIn } from '@/features/review/Workspace';
export const generateMetadata: GenerateMetadataFunction = () => ({ title: APP_NAME });
export default function Home() {
  return (
    <SignedIn>
      <Queue />
    </SignedIn>
  );
}
