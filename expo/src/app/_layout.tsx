import { Slot } from 'expo-router';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!convexUrl) throw new Error('EXPO_PUBLIC_CONVEX_URL is required. See docs/development.md.');
const convex = new ConvexReactClient(convexUrl);

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <Slot />
    </ConvexProvider>
  );
}
