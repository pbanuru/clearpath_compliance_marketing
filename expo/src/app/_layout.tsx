import { Slot } from 'expo-router';
import { ConvexReactClient } from 'convex/react';
import { AccountProvider } from '../features/auth/AccountProvider';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error('EXPO_PUBLIC_CONVEX_URL is required. See docs/development.md.');
const convex = new ConvexReactClient(convexUrl);

export default function RootLayout() {
  return (
    <AccountProvider client={convex}>
      <Slot />
    </AccountProvider>
  );
}
